import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Book } from "../types";
import type { IPlatformService } from "../services";
import { setPlatformService } from "../services";
import { buildStoreOnlyZip, type ZipEntry } from "../utils/store-only-zip";
import { createEpubDraft } from "./draft";
import { patchEpubChapterInDraft, readEpubChapterFromDraft } from "./chapter";

const encoder = new TextEncoder();

function textEntry(name: string, content: string): ZipEntry {
  return { name, data: encoder.encode(content) };
}

function buildEpub(): Uint8Array {
  return buildStoreOnlyZip([
    textEntry("mimetype", "application/epub+zip"),
    textEntry(
      "META-INF/container.xml",
      `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>`,
    ),
    textEntry(
      "OPS/package.opf",
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Chapter Draft</dc:title></metadata><manifest><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/><item id="style" href="style.css" media-type="text/css"/></manifest><spine><itemref idref="chapter-1"/></spine></package>`,
    ),
    textEntry(
      "OPS/chapter-1.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>First Chapter</h1><p>Draft chapter text for editing.</p></body></html>`,
    ),
    textEntry("OPS/style.css", "body { line-height: 1.6; }"),
  ]);
}

function buildEpubWithEncodedChapterHref(): Uint8Array {
  return buildStoreOnlyZip([
    textEntry("mimetype", "application/epub+zip"),
    textEntry(
      "META-INF/container.xml",
      `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>`,
    ),
    textEntry(
      "OPS/package.opf",
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Encoded Chapter Draft</dc:title></metadata><manifest><item id="chapter-encoded" href="Text/%2A%3Achapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-encoded"/></spine></package>`,
    ),
    textEntry(
      "OPS/Text/*:chapter.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Encoded Chapter</h1><p>Decoded path text.</p></body></html>`,
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

describe("readEpubChapterFromDraft", () => {
  beforeEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("reads a chapter resource from the draft EPUB", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-chapter-"));
    const dataDir = await createPlatform(root);
    await writeFile(join(dataDir, "books", "sample.epub"), buildEpub());
    const book = {
      id: "book-1",
      filePath: "books/sample.epub",
      format: "epub",
      meta: { title: "Chapter Draft" },
    } as Book;
    const draft = await createEpubDraft(book, { draftId: "draft-1" });

    const chapter = await readEpubChapterFromDraft(draft.draftId, "chapter-1", {
      contentLimit: 20,
    });

    expect(chapter).toMatchObject({
      source: "draft",
      draftId: "draft-1",
      bookId: "book-1",
      id: "chapter-1",
      href: "chapter-1.xhtml",
      title: "First Chapter",
      contentFormat: "text",
      content: "First Chapter Draft ",
      contentTruncated: true,
      contentLimit: 20,
    });
  });

  it("can read raw XHTML for controlled draft editing", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-chapter-"));
    const dataDir = await createPlatform(root);
    await writeFile(join(dataDir, "books", "sample.epub"), buildEpub());
    const book = {
      id: "book-1",
      filePath: "books/sample.epub",
      format: "epub",
      meta: { title: "Chapter Draft" },
    } as Book;
    const draft = await createEpubDraft(book, { draftId: "draft-1" });

    const chapter = await readEpubChapterFromDraft(draft.draftId, "chapter-1", {
      contentFormat: "xhtml",
      contentLimit: 1000,
    });

    expect(chapter).toMatchObject({
      source: "draft",
      id: "chapter-1",
      contentFormat: "xhtml",
      contentTruncated: false,
    });
    expect(chapter.content).toContain("<body>");
    expect(chapter.content).toContain("Draft chapter text for editing.");
  });

  it("patches a chapter resource in the draft without changing the source EPUB", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-chapter-"));
    const dataDir = await createPlatform(root);
    const sourcePath = join(dataDir, "books", "sample.epub");
    const sourceBytes = buildEpub();
    await writeFile(sourcePath, sourceBytes);
    const book = {
      id: "book-1",
      filePath: "books/sample.epub",
      format: "epub",
      meta: { title: "Chapter Draft" },
    } as Book;
    const draft = await createEpubDraft(book, { draftId: "draft-1" });

    const patched = await patchEpubChapterInDraft(
      draft.draftId,
      "chapter-1",
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Revised Chapter</h1><p>Clean draft text.</p></body></html>`,
      { now: new Date("2026-06-16T00:00:00.000Z"), previewLimit: 80 },
    );

    expect(patched).toMatchObject({
      draftId: "draft-1",
      bookId: "book-1",
      chapterId: "chapter-1",
      href: "chapter-1.xhtml",
      resourcePath: "OPS/chapter-1.xhtml",
      changed: true,
      updatedAt: "2026-06-16T00:00:00.000Z",
      title: "Revised Chapter",
      contentPreview: "Revised Chapter Clean draft text.",
      contentPreviewTruncated: false,
      manifestPath: "drafts/epub/draft-1/manifest.json",
      historyPath: "drafts/epub/draft-1/history.jsonl",
    });
    expect(patched.beforeHash).toHaveLength(64);
    expect(patched.afterHash).toHaveLength(64);
    expect(patched.afterHash).not.toBe(patched.beforeHash);

    expect(Array.from(await readFile(sourcePath))).toEqual(Array.from(sourceBytes));
    const chapter = await readEpubChapterFromDraft(draft.draftId, "chapter-1");
    expect(chapter).toMatchObject({
      title: "Revised Chapter",
      contentFormat: "text",
      content: "Revised Chapter Clean draft text.",
    });

    const manifest = JSON.parse(
      await readFile(join(dataDir, "drafts", "epub", "draft-1", "manifest.json"), "utf8"),
    );
    expect(manifest).toMatchObject({
      updatedAt: "2026-06-16T00:00:00.000Z",
      inspect: {
        metadata: { title: "Chapter Draft" },
      },
    });

    const historyLines = (
      await readFile(join(dataDir, "drafts", "epub", "draft-1", "history.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(historyLines).toHaveLength(2);
    expect(historyLines[1]).toMatchObject({
      action: "epub.chapter.patch",
      bookId: "book-1",
      draftId: "draft-1",
      chapterId: "chapter-1",
      href: "chapter-1.xhtml",
      beforeHash: patched.beforeHash,
      afterHash: patched.afterHash,
    });
  });

  it("reads and patches a chapter whose manifest href is percent-encoded", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-chapter-"));
    const dataDir = await createPlatform(root);
    await writeFile(join(dataDir, "books", "encoded.epub"), buildEpubWithEncodedChapterHref());
    const book = {
      id: "book-encoded",
      filePath: "books/encoded.epub",
      format: "epub",
      meta: { title: "Encoded Chapter Draft" },
    } as Book;
    const draft = await createEpubDraft(book, { draftId: "draft-encoded" });

    const chapter = await readEpubChapterFromDraft(draft.draftId, "chapter-encoded");

    expect(chapter).toMatchObject({
      id: "chapter-encoded",
      href: "Text/%2A%3Achapter.xhtml",
      title: "Encoded Chapter",
      content: "Encoded Chapter Decoded path text.",
    });

    const patched = await patchEpubChapterInDraft(
      draft.draftId,
      "chapter-encoded",
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Patched Encoded Chapter</h1><p>Still writes the decoded zip entry.</p></body></html>`,
    );

    expect(patched).toMatchObject({
      href: "Text/%2A%3Achapter.xhtml",
      resourcePath: "OPS/Text/*:chapter.xhtml",
      changed: true,
      title: "Patched Encoded Chapter",
    });
    await expect(readEpubChapterFromDraft(draft.draftId, "chapter-encoded")).resolves.toMatchObject(
      {
        title: "Patched Encoded Chapter",
        content: "Patched Encoded Chapter Still writes the decoded zip entry.",
      },
    );
  });
});
