import { resolveDesktopDataPath } from "@/lib/storage/desktop-library-root";
import type { Book } from "@readany/core/types";
import type { ExtractedBookMetadata } from "@readany/core/utils";

export async function extractLocalBookMetadata(book: Book): Promise<ExtractedBookMetadata | null> {
  if (book.syncStatus === "remote" || book.format !== "epub" || !book.filePath) return null;

  try {
    const filePath = await resolveDesktopDataPath(book.filePath);
    const { exists, readFile } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(filePath))) return null;
    return extractEpubOpfMetadata(await readFile(filePath));
  } catch (error) {
    console.warn("[BookMetadata] Failed to extract local metadata:", error);
    return null;
  }
}

async function extractEpubOpfMetadata(bytes: Uint8Array): Promise<ExtractedBookMetadata | null> {
  const { configure, ZipReader, BlobReader, TextWriter } = await import("@zip.js/zip.js");
  configure({ useWebWorkers: false });

  // slice() on a Uint8Array-backed ArrayBuffer yields a plain ArrayBuffer;
  // the cast keeps TS5.7's SharedArrayBuffer-aware ArrayBufferLike happy.
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const reader = new ZipReader(new BlobReader(new Blob([buffer])));

  try {
    const entries = await reader.getEntries();
    const entryMap = new Map(entries.map((entry) => [entry.filename, entry]));

    const readTextEntry = async (path: string): Promise<string | null> => {
      let entry = entryMap.get(path);
      if (!entry) {
        const lower = path.toLowerCase();
        entry = entries.find((candidate) => candidate.filename.toLowerCase() === lower);
      }
      if (!entry || entry.directory || !entry.getData) return null;
      return entry.getData(new TextWriter());
    };

    const containerXml = await readTextEntry("META-INF/container.xml");
    if (!containerXml) return null;

    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, "application/xml");
    const opfPath =
      Array.from(containerDoc.getElementsByTagName("rootfile"))[0]?.getAttribute("full-path") ||
      "content.opf";
    const opfXml = await readTextEntry(opfPath);
    if (!opfXml) return null;

    return parseOpfMetadata(opfXml);
  } finally {
    await reader.close();
  }
}

function parseOpfMetadata(opfXml: string): ExtractedBookMetadata {
  const parser = new DOMParser();
  const doc = parser.parseFromString(opfXml, "application/xml");
  const metadata =
    Array.from(doc.getElementsByTagName("*")).find((element) => element.localName === "metadata") ??
    doc.documentElement;
  const elements = Array.from(metadata.getElementsByTagName("*"));
  const textByLocalName = (localName: string) =>
    elements.find((element) => element.localName === localName)?.textContent?.trim() || "";
  const subjects = elements
    .filter((element) => element.localName === "subject")
    .map((element) => element.textContent?.trim() || "")
    .filter(Boolean);

  return {
    title: textByLocalName("title"),
    author: textByLocalName("creator"),
    publisher: textByLocalName("publisher"),
    language: textByLocalName("language"),
    isbn: extractIsbn(elements),
    publishDate: extractPublishDate(elements),
    description: textByLocalName("description"),
    subjects,
  };
}

function extractIsbn(elements: Element[]): string {
  for (const element of elements) {
    if (element.localName !== "identifier") continue;
    const scheme =
      element.getAttribute("opf:scheme") ||
      element.getAttribute("scheme") ||
      element.getAttributeNS("http://www.idpf.org/2007/opf", "scheme") ||
      "";
    const text = element.textContent?.trim() || "";
    if (scheme.toLowerCase() === "isbn" || /(?:97[89][-\s]?)?(?:\d[-\s]?){9,12}[\dXx]/.test(text)) {
      return text;
    }
  }
  return "";
}

function extractPublishDate(elements: Element[]): string {
  const issued = elements.find(
    (element) =>
      element.localName === "meta" &&
      (element.getAttribute("property") === "dcterms:issued" ||
        element.getAttribute("name") === "dcterms:issued"),
  );
  const issuedText = issued?.textContent?.trim();
  if (issuedText) return issuedText;

  return elements.find((element) => element.localName === "date")?.textContent?.trim() || "";
}
