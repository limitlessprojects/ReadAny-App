import { describe, expect, it } from "vitest";
import { buildStoreOnlyZip, type ZipEntry } from "../utils/store-only-zip";
import { inspectEpubBytes } from "./inspect";

const encoder = new TextEncoder();

function textEntry(name: string, content: string): ZipEntry {
  return { name, data: encoder.encode(content) };
}

function buildMinimalEpub(): Uint8Array {
  return buildStoreOnlyZip([
    textEntry("mimetype", "application/epub+zip"),
    textEntry(
      "META-INF/container.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    ),
    textEntry(
      "OPS/package.opf",
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Inspectable EPUB</dc:title>
    <dc:creator>Ada Reader</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="book-id">urn:uuid:inspectable</dc:identifier>
    <dc:subject>AI</dc:subject>
    <meta property="dcterms:modified">2026-01-02T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="chapter-1"/>
  </spine>
</package>`,
    ),
    textEntry(
      "OPS/nav.xhtml",
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="chapter-1.xhtml">Chapter One</a></li>
      </ol>
    </nav>
  </body>
</html>`,
    ),
    textEntry("OPS/chapter-1.xhtml", "<html><body><h1>Chapter One</h1></body></html>"),
    textEntry("OPS/style.css", "body { line-height: 1.6; }"),
  ]);
}

describe("inspectEpubBytes", () => {
  it("extracts EPUB package metadata and structure", async () => {
    const result = await inspectEpubBytes(buildMinimalEpub());

    expect(result).toMatchObject({
      format: "epub",
      packagePath: "OPS/package.opf",
      version: "3.0",
      metadata: {
        title: "Inspectable EPUB",
        creator: "Ada Reader",
        language: "en",
        identifier: "urn:uuid:inspectable",
        modified: "2026-01-02T00:00:00Z",
        subjects: ["AI"],
      },
      manifest: {
        count: 3,
        items: [
          { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml" },
          { id: "chapter-1", href: "chapter-1.xhtml", mediaType: "application/xhtml+xml" },
          { id: "css", href: "style.css", mediaType: "text/css" },
        ],
      },
      spine: {
        count: 1,
        items: [
          { idref: "chapter-1", href: "chapter-1.xhtml", mediaType: "application/xhtml+xml" },
        ],
      },
      toc: {
        count: 1,
        items: [{ label: "Chapter One", href: "chapter-1.xhtml", level: 1 }],
      },
    });
  });
});
