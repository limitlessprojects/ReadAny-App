import { DOMParser } from "@xmldom/xmldom";
import { getPlatformService } from "../services";
import {
  readActiveEpubDraftManifest,
  writeEpubDraftUndoSnapshot,
  type EpubDraftManifest,
} from "./draft";
import { generateId } from "../utils/generate-id";
import { findPackageResourcePath, inspectEpubBytes } from "./inspect";
import { withEpubPackageResourceReader } from "./inspect";
import { replaceZipTextEntry, sha256Hex } from "./zip";

export type EpubChapterReadResult = {
  source: "draft" | "book";
  id: string;
  href: string;
  mediaType?: string;
  title?: string;
  contentFormat: "text" | "xhtml";
  content: string;
  contentTruncated: boolean;
  contentLimit: number;
  draftId?: string;
  bookId?: string;
};

export type EpubChapterPatchResult = {
  draftId: string;
  bookId: string;
  chapterId: string;
  href: string;
  resourcePath: string;
  beforeHash: string;
  afterHash: string;
  changed: boolean;
  operationId: string;
  updatedAt: string;
  title?: string;
  contentPreview: string;
  contentPreviewTruncated: boolean;
  manifestPath: string;
  historyPath: string;
};

export async function assertPatchableEpubChapterInDraft(
  draftId: string,
  chapterId: string,
  xhtml: string,
): Promise<void> {
  const platform = getPlatformService();
  const { dataDir, manifest } = await readActiveEpubDraftManifest(draftId);
  const draftPath = await platform.joinPath(dataDir, manifest.draftFilePath);
  if (!(await platform.exists(draftPath))) {
    throw new Error(`EPUB draft file was not found: ${manifest.draftFilePath}`);
  }

  assertReadableEpubChapterXhtml(xhtml);
  await findChapterResource(await platform.readFile(draftPath), chapterId);
}

export async function readEpubChapterFromDraft(
  draftId: string,
  chapterId: string,
  options: { contentLimit?: number; contentFormat?: "text" | "xhtml" } = {},
): Promise<EpubChapterReadResult> {
  const platform = getPlatformService();
  const { dataDir, manifest } = await readActiveEpubDraftManifest(draftId);
  const draftPath = await platform.joinPath(dataDir, manifest.draftFilePath);
  if (!(await platform.exists(draftPath))) {
    throw new Error(`EPUB draft file was not found: ${manifest.draftFilePath}`);
  }

  const chapter = await readEpubChapterBytes(
    await platform.readFile(draftPath),
    chapterId,
    options,
  );
  return {
    ...chapter,
    source: "draft",
    draftId,
    bookId: manifest.bookId,
  };
}

export async function patchEpubChapterInDraft(
  draftId: string,
  chapterId: string,
  xhtml: string,
  options: { now?: Date; previewLimit?: number } = {},
): Promise<EpubChapterPatchResult> {
  const platform = getPlatformService();
  const { dataDir, manifestPath, historyPath, manifest } =
    await readActiveEpubDraftManifest(draftId);
  const draftPath = await platform.joinPath(dataDir, manifest.draftFilePath);
  if (!(await platform.exists(draftPath))) {
    throw new Error(`EPUB draft file was not found: ${manifest.draftFilePath}`);
  }

  assertReadableEpubChapterXhtml(xhtml);
  const draftBytes = await platform.readFile(draftPath);
  const chapterResource = await findChapterResource(draftBytes, chapterId);
  const beforeXml = chapterResource.content;
  const beforeHash = await sha256Hex(new TextEncoder().encode(beforeXml));
  const afterHash = await sha256Hex(new TextEncoder().encode(xhtml));
  const changed = beforeHash !== afterHash;
  const updatedAt = (options.now ?? new Date()).toISOString();
  const operationId = generateId();

  if (changed) {
    const patchedBytes = await replaceZipTextEntry(draftBytes, chapterResource.resourcePath, xhtml);
    await platform.writeFile(draftPath, patchedBytes);
    await writeEpubDraftUndoSnapshot(draftId, {
      version: 1,
      operationId,
      action: "epub.chapter.patch",
      resourcePath: chapterResource.resourcePath,
      beforeContent: beforeXml,
      beforeHash,
      afterHash,
    });
  }

  const nextManifest: EpubDraftManifest = {
    ...manifest,
    updatedAt,
    inspect: changed
      ? await inspectEpubBytes(await platform.readFile(draftPath))
      : manifest.inspect,
  };
  await platform.writeTextFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);

  await appendHistoryLine(historyPath, {
    id: operationId,
    timestamp: updatedAt,
    action: "epub.chapter.patch",
    bookId: manifest.bookId,
    draftId,
    chapterId,
    href: chapterResource.href,
    beforeHash,
    afterHash,
  });

  const text = extractReadableText(xhtml);
  const previewLimit = clampContentLimit(options.previewLimit ?? 1000);
  const previewTruncated = text.length > previewLimit;
  return {
    draftId,
    bookId: manifest.bookId,
    chapterId,
    href: chapterResource.href,
    resourcePath: chapterResource.resourcePath,
    beforeHash,
    afterHash,
    changed,
    operationId,
    updatedAt,
    title: extractTitle(xhtml),
    contentPreview: previewTruncated ? text.slice(0, previewLimit) : text,
    contentPreviewTruncated: previewTruncated,
    manifestPath: `drafts/epub/${draftId}/manifest.json`,
    historyPath: `drafts/epub/${draftId}/history.jsonl`,
  };
}

export async function readEpubChapterFromBookFile(
  bookId: string,
  bookFilePath: string,
  chapterId: string,
  options: { contentLimit?: number; contentFormat?: "text" | "xhtml" } = {},
): Promise<EpubChapterReadResult> {
  const platform = getPlatformService();
  const dataDir = await platform.getDataDir();
  const absolutePath = await platform.joinPath(dataDir, bookFilePath);
  if (!(await platform.exists(absolutePath))) {
    throw new Error(`Book file was not found for ${bookId}: ${bookFilePath}`);
  }

  const chapter = await readEpubChapterBytes(
    await platform.readFile(absolutePath),
    chapterId,
    options,
  );
  return {
    ...chapter,
    source: "book",
    bookId,
  };
}

async function findChapterResource(
  bytes: Uint8Array,
  chapterId: string,
): Promise<{
  id: string;
  href: string;
  mediaType: string;
  resourcePath: string;
  content: string;
}> {
  return withEpubPackageResourceReader(
    bytes,
    async ({ packagePath, packageDir, entryPaths, readTextEntry }) => {
      const opfXml = await readTextEntry(packagePath);
      if (!opfXml) throw new Error(`EPUB package document was not found: ${packagePath}`);

      const manifestItems = parseManifestItems(opfXml);
      const item = manifestItems.find((candidate) => candidate.id === chapterId);
      if (!item) {
        throw new Error(`EPUB chapter resource was not found: ${chapterId}`);
      }
      if (!item.mediaType.includes("html")) {
        throw new Error(`EPUB resource is not a readable XHTML chapter: ${chapterId}`);
      }

      const resourcePath = findPackageResourcePath(entryPaths, packageDir, item.href);
      if (!resourcePath) throw new Error(`EPUB chapter file was not found: ${item.href}`);
      const content = await readTextEntry(resourcePath);
      if (!content) throw new Error(`EPUB chapter file was not found: ${item.href}`);
      return {
        ...item,
        resourcePath,
        content,
      };
    },
  );
}

async function readEpubChapterBytes(
  bytes: Uint8Array,
  chapterId: string,
  options: { contentLimit?: number; contentFormat?: "text" | "xhtml" },
): Promise<Omit<EpubChapterReadResult, "source" | "draftId" | "bookId">> {
  const chapter = await findChapterResource(bytes, chapterId);
  const title = extractTitle(chapter.content);
  const contentFormat = options.contentFormat ?? "text";
  const content =
    contentFormat === "xhtml" ? chapter.content : extractReadableText(chapter.content);
  const contentLimit = clampContentLimit(options.contentLimit);
  const truncated = content.length > contentLimit;
  return {
    id: chapter.id,
    href: chapter.href,
    mediaType: chapter.mediaType,
    title,
    contentFormat,
    content: truncated ? content.slice(0, contentLimit) : content,
    contentTruncated: truncated,
    contentLimit,
  };
}

function parseManifestItems(
  opfXml: string,
): Array<{ id: string; href: string; mediaType: string }> {
  const doc = new DOMParser().parseFromString(opfXml, "application/xml") as unknown as Document;
  return Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "item")
    .map((item) => ({
      id: item.getAttribute("id") ?? "",
      href: item.getAttribute("href") ?? "",
      mediaType: item.getAttribute("media-type") ?? "",
    }))
    .filter((item) => item.id && item.href);
}

function extractTitle(xml: string): string | undefined {
  const doc = new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;
  const heading = Array.from(doc.getElementsByTagName("*")).find((element) =>
    /^h[1-6]$/i.test(element.localName),
  );
  return heading?.textContent?.replace(/\s+/g, " ").trim() || undefined;
}

function extractReadableText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;
  const body = Array.from(doc.getElementsByTagName("*")).find(
    (element) => element.localName === "body",
  );
  const root = body ?? doc.documentElement;
  const chunks: string[] = [];
  collectText(root, chunks);
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

export function assertReadableEpubChapterXhtml(xml: string): void {
  const doc = new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;
  const parserError = Array.from(doc.getElementsByTagName("*")).find(
    (element) => element.localName === "parsererror",
  );
  if (parserError) {
    throw new Error("Patched chapter XHTML could not be parsed.");
  }
  const body = Array.from(doc.getElementsByTagName("*")).find(
    (element) => element.localName === "body",
  );
  if (!body) {
    throw new Error("Patched chapter XHTML must include a body element.");
  }
}

function collectText(node: Node, chunks: string[]): void {
  if (node.nodeType === 3) {
    const text = node.textContent?.replace(/\s+/g, " ").trim();
    if (text) chunks.push(text);
    return;
  }

  if (node.nodeType !== 1) return;
  const element = node as Element;
  if (["script", "style", "svg"].includes(element.localName.toLowerCase())) return;
  for (const child of Array.from(element.childNodes)) {
    collectText(child, chunks);
  }
}

function clampContentLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return 12000;
  return Math.min(Math.floor(limit), 50000);
}

async function appendHistoryLine(path: string, entry: unknown): Promise<void> {
  const platform = getPlatformService();
  const existing = (await platform.exists(path)) ? await platform.readTextFile(path) : "";
  await platform.writeTextFile(path, `${existing}${JSON.stringify(entry)}\n`);
}
