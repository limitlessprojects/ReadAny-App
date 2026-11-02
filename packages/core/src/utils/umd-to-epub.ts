/**
 * UMD to EPUB converter.
 *
 * Pipeline: UMD binary → parsed chapters + cover → EPUB 2.0 store-only ZIP.
 * Mirrors the shape of TxtToEpubConverter.convertToBytes — same call site
 * pattern in library-store importBooks.
 *
 * zlib inflate is injected so the converter stays platform-agnostic:
 *   - Desktop: foliate-js/vendor/fflate.unzlibSync
 *   - Mobile : pako.inflate (Hermes lacks DecompressionStream)
 */

import { parseUmd, type UmdChapter, type UmdInflate, type UmdParsed } from "./umd-parser";
import { buildStoreOnlyZip, type ZipEntry } from "./store-only-zip";

export interface Umd2EpubOptions {
  file: File;
}

export interface UmdBytesConversionResult {
  epubBytes: Uint8Array;
  bookTitle: string;
  author: string;
  language: "zh";
  chapterCount: number;
  coverBytes?: Uint8Array;
  coverMime?: "image/jpeg";
}

const escapeXml = (str: string): string => {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

function formatChapterContent(rawText: string): string {
  // UMD content uses \n (we converted U+2029 paragraph separators during
  // parse). Strip leading/trailing whitespace per line, drop empties.
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return "";
  return lines.map((l) => `<p>${escapeXml(l)}</p>`).join("");
}

function buildChapterXhtml(chapter: UmdChapter): string {
  const title = escapeXml(chapter.title);
  const body = formatChapterContent(chapter.content);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" lang="zh" xml:lang="zh">\n` +
    `<head>\n  <title>${title}</title>\n  <link rel="stylesheet" type="text/css" href="../style.css"/>\n</head>\n` +
    `<body><h2>${title}</h2>${body}</body>\n` +
    `</html>`
  );
}

function buildCoverXhtml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" lang="zh" xml:lang="zh">\n` +
    `<head><title>Cover</title>\n  <style type="text/css">body { margin: 0; padding: 0; text-align: center; } img { max-width: 100%; height: auto; }</style>\n</head>\n` +
    `<body><div><img src="cover.jpg" alt="cover"/></div></body>\n` +
    `</html>`
  );
}

function buildContainerXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">\n` +
    `  <rootfiles>\n    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n` +
    `</container>`
  );
}

function buildTocNcx(bookTitle: string, author: string, chapters: UmdChapter[]): string {
  const navPoints = chapters
    .map((c, i) => {
      const id = `chapter${i + 1}`;
      return (
        `<navPoint id="navPoint-${id}" playOrder="${i + 1}">\n` +
        `  <navLabel><text>${escapeXml(c.title)}</text></navLabel>\n` +
        `  <content src="./OEBPS/${id}.xhtml"/>\n` +
        `</navPoint>`
      );
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n` +
    `<head>\n  <meta name="dtb:uid" content="book-id"/>\n  <meta name="dtb:depth" content="1"/>\n  <meta name="dtb:totalPageCount" content="0"/>\n  <meta name="dtb:maxPageNumber" content="0"/>\n</head>\n` +
    `<docTitle><text>${escapeXml(bookTitle)}</text></docTitle>\n` +
    `<docAuthor><text>${escapeXml(author)}</text></docAuthor>\n` +
    `<navMap>\n${navPoints}\n</navMap>\n` +
    `</ncx>`
  );
}

function buildContentOpf(
  bookTitle: string,
  author: string,
  identifier: string,
  chapters: UmdChapter[],
  hasCover: boolean,
): string {
  const chapterManifest = chapters
    .map(
      (_, i) =>
        `<item id="chap${i + 1}" href="OEBPS/chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join("\n      ");
  const chapterSpine = chapters
    .map((_, i) => `<itemref idref="chap${i + 1}"/>`)
    .join("\n      ");

  const coverMetaTag = hasCover ? `\n    <meta name="cover" content="cover-image"/>` : "";
  const coverManifest = hasCover
    ? `\n      <item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>\n      <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>`
    : "";
  const coverSpine = hasCover
    ? `\n      <itemref idref="cover-page" linear="no"/>`
    : "";

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="2.0">\n` +
    `  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
    `    <dc:title>${escapeXml(bookTitle)}</dc:title>\n` +
    `    <dc:language>zh</dc:language>\n` +
    `    <dc:creator>${escapeXml(author)}</dc:creator>\n` +
    `    <dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>${coverMetaTag}\n` +
    `  </metadata>\n` +
    `  <manifest>\n      ${chapterManifest}\n      <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n      <item id="css" href="style.css" media-type="text/css"/>${coverManifest}\n  </manifest>\n` +
    `  <spine toc="ncx">${coverSpine}\n      ${chapterSpine}\n  </spine>\n` +
    `</package>`
  );
}

function simpleIdentifier(file: File): string {
  return `umd-${file.name}-${file.size}-${Date.now().toString(36)}`;
}

function deriveBookTitle(parsed: UmdParsed, file: File): string {
  if (parsed.bookTitle && parsed.bookTitle.trim()) return parsed.bookTitle.trim();
  const base = file.name.replace(/\\/g, "/").split("/").pop() || file.name;
  return base.replace(/\.umd$/i, "");
}

function buildEpubBytes(parsed: UmdParsed, file: File): UmdBytesConversionResult {
  const bookTitle = deriveBookTitle(parsed, file);
  const author = parsed.author || "";
  const identifier = simpleIdentifier(file);
  const chapters = parsed.chapters;
  const hasCover = !!(parsed.coverBytes && parsed.coverBytes.length > 0);

  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];

  // mimetype first, store-only — required by EPUB spec
  entries.push({ name: "mimetype", data: encoder.encode("application/epub+zip") });
  entries.push({ name: "META-INF/container.xml", data: encoder.encode(buildContainerXml()) });

  const css =
    `body { line-height: 1.6; font-size: 1em; font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; text-align: justify; }\n` +
    `p { text-indent: 2em; margin: 0 0 0.4em 0; }\n` +
    `h2 { text-align: center; margin: 1em 0 0.6em 0; }`;
  entries.push({ name: "style.css", data: encoder.encode(css) });

  entries.push({ name: "toc.ncx", data: encoder.encode(buildTocNcx(bookTitle, author, chapters)) });

  for (let i = 0; i < chapters.length; i++) {
    entries.push({
      name: `OEBPS/chapter${i + 1}.xhtml`,
      data: encoder.encode(buildChapterXhtml(chapters[i]!)),
    });
  }

  if (hasCover) {
    entries.push({ name: "cover.xhtml", data: encoder.encode(buildCoverXhtml()) });
    entries.push({ name: "cover.jpg", data: parsed.coverBytes! });
  }

  entries.push({
    name: "content.opf",
    data: encoder.encode(buildContentOpf(bookTitle, author, identifier, chapters, hasCover)),
  });

  const epubBytes = buildStoreOnlyZip(entries);
  return {
    epubBytes,
    bookTitle,
    author,
    language: "zh",
    chapterCount: chapters.length,
    coverBytes: parsed.coverBytes,
    coverMime: parsed.coverMime,
  };
}

export class UmdToEpubConverter {
  /**
   * @param inflate zlib inflate impl (e.g. `fflate.unzlibSync` or `pako.inflate`).
   */
  constructor(private readonly inflate: UmdInflate) {}

  public async convertToBytes(options: Umd2EpubOptions): Promise<UmdBytesConversionResult> {
    const { file } = options;
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const parsed = parseUmd(bytes, this.inflate);
    if (parsed.chapters.length === 0) {
      throw new Error("UMD: no chapters detected");
    }
    return buildEpubBytes(parsed, file);
  }
}
