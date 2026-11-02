import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Book } from "../types";
import type { IPlatformService } from "../services";
import { setPlatformService } from "../services";
import { buildStoreOnlyZip, type ZipEntry } from "../utils/store-only-zip";
import { createEpubDraft } from "./draft";
import { validateEpubDraft } from "./validate";

const encoder = new TextEncoder();

function textEntry(name: string, content: string): ZipEntry {
  return { name, data: encoder.encode(content) };
}

function buildValidEpub(): Uint8Array {
  return buildStoreOnlyZip([
    textEntry("mimetype", "application/epub+zip"),
    textEntry(
      "META-INF/container.xml",
      `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>`,
    ),
    textEntry(
      "OPS/package.opf",
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Valid Draft</dc:title><dc:creator>Ada Reader</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/><item id="css" href="style.css" media-type="text/css"/></manifest><spine><itemref idref="chapter-1"/></spine></package>`,
    ),
    textEntry(
      "OPS/nav.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter-1.xhtml">Start</a></li></ol></nav></body></html>`,
    ),
    textEntry(
      "OPS/chapter-1.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><link href="style.css" rel="stylesheet"/></head><body><h1>Start</h1></body></html>`,
    ),
    textEntry("OPS/style.css", "body { line-height: 1.6; }"),
  ]);
}

function buildInvalidEpub(): Uint8Array {
  return buildStoreOnlyZip([
    textEntry("mimetype", "application/epub+zip"),
    textEntry(
      "META-INF/container.xml",
      `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>`,
    ),
    textEntry(
      "OPS/package.opf",
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Invalid Draft</dc:title></metadata><manifest><item id="chapter-1" href="missing.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="missing-id"/></spine></package>`,
    ),
  ]);
}

function buildEpubWithEncodedResourceHrefs(): Uint8Array {
  return buildStoreOnlyZip([
    textEntry("mimetype", "application/epub+zip"),
    textEntry(
      "META-INF/container.xml",
      `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>`,
    ),
    textEntry(
      "OPS/package.opf",
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Encoded Valid Draft</dc:title><dc:creator>Ada Reader</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav%3A.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter-1" href="chapter%3A1.xhtml" media-type="application/xhtml+xml"/><item id="css" href="style%3A.css" media-type="text/css"/></manifest><spine><itemref idref="chapter-1"/></spine></package>`,
    ),
    textEntry(
      "OPS/nav:.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter%3A1.xhtml">Encoded Start</a></li></ol></nav></body></html>`,
    ),
    textEntry(
      "OPS/chapter:1.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><link href="style%3A.css" rel="stylesheet"/></head><body><h1>Encoded Start</h1><img src="kindle:embed:0001?mime=image/jpg"/></body></html>`,
    ),
    textEntry("OPS/style:.css", "body { line-height: 1.6; }"),
  ]);
}

async function createPlatform(root: string) {
  const dataDir = join(root, "library");
  await mkdir(join(dataDir, "books"), { recursive: true });
  setPlatformService({
    platformType: "desktop",
    isDesktop: true,
    isMobile: false,
    async readFile(path) {
      return readFile(path);
    },
    async writeFile(path, data) {
      await writeFile(path, data);
    },
    async writeTextFile(path, content) {
      await writeFile(path, content, "utf8");
    },
    async readTextFile(path) {
      return readFile(path, "utf8");
    },
    async mkdir(path) {
      await mkdir(path, { recursive: true });
    },
    async exists(path) {
      try {
        await readFile(path);
        return true;
      } catch {
        return false;
      }
    },
    async deleteFile() {
      throw new Error("not used");
    },
    async getAppDataDir() {
      return dataDir;
    },
    async getDataDir() {
      return dataDir;
    },
    async joinPath(...parts) {
      return join(...parts);
    },
    convertFileSrc(path) {
      return `file://${path}`;
    },
    async pickFile() {
      return null;
    },
    async loadDatabase() {
      throw new Error("not used");
    },
    async fetch() {
      throw new Error("not used");
    },
    async createWebSocket() {
      throw new Error("not used");
    },
    async getAppVersion() {
      return "0.1.0";
    },
    async kvGetItem() {
      return null;
    },
    async kvSetItem() {},
    async kvRemoveItem() {},
    async kvGetAllKeys() {
      return [];
    },
    async copyToClipboard() {
      throw new Error("not used");
    },
    async shareOrDownloadFile() {
      throw new Error("not used");
    },
  });
  return dataDir;
}

describe("validateEpubDraft", () => {
  beforeEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("validates an active EPUB draft without exposing absolute paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-validate-"));
    const dataDir = await createPlatform(root);
    await writeFile(join(dataDir, "books", "valid.epub"), buildValidEpub());
    const book = {
      id: "book-1",
      filePath: "books/valid.epub",
      format: "epub",
      meta: { title: "Valid Draft" },
    } as Book;
    await createEpubDraft(book, { draftId: "draft-1" });

    const validation = await validateEpubDraft("draft-1", {
      now: new Date("2026-06-16T00:00:00Z"),
    });

    expect(validation).toMatchObject({
      draftId: "draft-1",
      bookId: "book-1",
      valid: true,
      checkedAt: "2026-06-16T00:00:00.000Z",
      draftFilePath: "drafts/epub/draft-1/source.epub",
      packagePath: "OPS/package.opf",
      manifestItemCount: 3,
      spineItemCount: 1,
      tocItemCount: 1,
      errorCount: 0,
      warningCount: 0,
      issues: [],
    });
    expect(validation.draftHash).toHaveLength(64);
    expect(JSON.stringify(validation)).not.toContain(root);
  });

  it("reports structural errors and warnings", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-validate-"));
    const dataDir = await createPlatform(root);
    await writeFile(join(dataDir, "books", "invalid.epub"), buildInvalidEpub());
    const book = {
      id: "book-1",
      filePath: "books/invalid.epub",
      format: "epub",
      meta: { title: "Invalid Draft" },
    } as Book;
    await createEpubDraft(book, { draftId: "draft-1" });

    const validation = await validateEpubDraft("draft-1");

    expect(validation.valid).toBe(false);
    expect(validation.errorCount).toBeGreaterThanOrEqual(2);
    expect(validation.warningCount).toBeGreaterThanOrEqual(1);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_language", severity: "warning" }),
        expect.objectContaining({
          code: "spine_idref_missing_manifest_item",
          severity: "error",
        }),
        expect.objectContaining({ code: "manifest_resource_missing", severity: "error" }),
      ]),
    );
  });

  it("accepts percent-encoded EPUB hrefs and ignores Kindle internal resource links", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-validate-"));
    const dataDir = await createPlatform(root);
    await writeFile(join(dataDir, "books", "encoded.epub"), buildEpubWithEncodedResourceHrefs());
    const book = {
      id: "book-encoded",
      filePath: "books/encoded.epub",
      format: "epub",
      meta: { title: "Encoded Valid Draft" },
    } as Book;
    await createEpubDraft(book, { draftId: "draft-encoded" });

    const validation = await validateEpubDraft("draft-encoded");

    expect(validation).toMatchObject({
      valid: true,
      manifestItemCount: 3,
      spineItemCount: 1,
      tocItemCount: 1,
      errorCount: 0,
      warningCount: 0,
      issues: [],
    });
  });
});
