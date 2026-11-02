import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Book } from "../types";
import type { IPlatformService } from "../services";
import { setPlatformService } from "../services";
import { buildStoreOnlyZip, type ZipEntry } from "../utils/store-only-zip";
import { createEpubDraft, readEpubDraftHistory } from "./draft";
import { inspectEpubBytes } from "./inspect";
import { rebuildEpubTocInDraft } from "./toc";
import { readZipTextEntry, sha256Hex } from "./zip";

const encoder = new TextEncoder();

function textEntry(name: string, content: string): ZipEntry {
  return { name, data: encoder.encode(content) };
}

function buildEpubWithStaleToc(): Uint8Array {
  return buildStoreOnlyZip([
    textEntry("mimetype", "application/epub+zip"),
    textEntry(
      "META-INF/container.xml",
      `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>`,
    ),
    textEntry(
      "OPS/package.opf",
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>TOC Draft</dc:title><dc:creator>Ada Reader</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/><item id="chapter-2" href="chapter-2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/><itemref idref="chapter-2"/></spine></package>`,
    ),
    textEntry(
      "OPS/nav.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><h1>Contents</h1><ol><li><a href="old.xhtml">Old TOC</a></li></ol></nav></body></html>`,
    ),
    textEntry(
      "OPS/chapter-1.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter One</title></head><body><h1>Ignored H1</h1></body></html>`,
    ),
    textEntry(
      "OPS/chapter-2.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Second Chapter</h1></body></html>`,
    ),
  ]);
}

function buildEpubWithNestedNav(): Uint8Array {
  return buildStoreOnlyZip([
    textEntry("mimetype", "application/epub+zip"),
    textEntry(
      "META-INF/container.xml",
      `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>`,
    ),
    textEntry(
      "OPS/package.opf",
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Nested Nav</dc:title><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter-1" href="text/chapter-1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/></spine></package>`,
    ),
    textEntry(
      "OPS/nav/nav.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="stale.xhtml">Stale</a></li></ol></nav></body></html>`,
    ),
    textEntry(
      "OPS/text/chapter-1.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Nested Chapter</h1></body></html>`,
    ),
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

describe("rebuildEpubTocInDraft", () => {
  beforeEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("rebuilds EPUB3 nav toc from spine chapters without modifying the source EPUB", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-toc-"));
    const dataDir = await createPlatform(root);
    const sourcePath = join(dataDir, "books", "toc.epub");
    const sourceBytes = buildEpubWithStaleToc();
    await writeFile(sourcePath, sourceBytes);
    const book = {
      id: "book-1",
      filePath: "books/toc.epub",
      format: "epub",
      meta: { title: "TOC Draft" },
    } as Book;
    await createEpubDraft(book, { draftId: "draft-1" });

    const result = await rebuildEpubTocInDraft("draft-1", {
      now: new Date("2026-06-16T00:00:00Z"),
    });

    expect(result).toMatchObject({
      draftId: "draft-1",
      bookId: "book-1",
      navPath: "OPS/nav.xhtml",
      itemCount: 2,
      changed: true,
      updatedAt: "2026-06-16T00:00:00.000Z",
      manifestPath: "drafts/epub/draft-1/manifest.json",
      historyPath: "drafts/epub/draft-1/history.jsonl",
      items: [
        { id: "chapter-1", href: "chapter-1.xhtml", label: "Chapter One" },
        { id: "chapter-2", href: "chapter-2.xhtml", label: "Second Chapter" },
      ],
    });
    expect(result.beforeHash).not.toBe(result.afterHash);

    const draftBytes = await readFile(join(dataDir, "drafts", "epub", "draft-1", "source.epub"));
    const navXml = await readZipTextEntry(draftBytes, "OPS/nav.xhtml");
    expect(navXml).toContain("Contents");
    expect(navXml).toContain("Chapter One");
    expect(navXml).toContain("Second Chapter");
    expect(navXml).not.toContain("Old TOC");

    const inspect = await inspectEpubBytes(draftBytes);
    expect(inspect.toc.items).toMatchObject([
      { label: "Chapter One", href: "chapter-1.xhtml" },
      { label: "Second Chapter", href: "chapter-2.xhtml" },
    ]);

    const history = await readEpubDraftHistory("draft-1");
    expect(history.entries[history.entries.length - 1]).toMatchObject({
      action: "epub.toc.rebuild",
      itemCount: 2,
    });
    expect(await sha256Hex(await readFile(sourcePath))).toBe(await sha256Hex(sourceBytes));
  });

  it("writes toc links relative to the nav document path", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-toc-nested-"));
    const dataDir = await createPlatform(root);
    const sourcePath = join(dataDir, "books", "nested.epub");
    await writeFile(sourcePath, buildEpubWithNestedNav());
    const book = {
      id: "book-nested",
      filePath: "books/nested.epub",
      format: "epub",
      meta: { title: "Nested Nav" },
    } as Book;
    await createEpubDraft(book, { draftId: "draft-nested" });

    const result = await rebuildEpubTocInDraft("draft-nested");

    expect(result).toMatchObject({
      navPath: "OPS/nav/nav.xhtml",
      items: [{ id: "chapter-1", href: "../text/chapter-1.xhtml", label: "Nested Chapter" }],
    });
    const draftBytes = await readFile(
      join(dataDir, "drafts", "epub", "draft-nested", "source.epub"),
    );
    const navXml = await readZipTextEntry(draftBytes, "OPS/nav/nav.xhtml");
    expect(navXml).toContain('href="../text/chapter-1.xhtml"');
  });
});
