import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import type { Book } from "../types";
import type { IPlatformService } from "../services";
import { buildStoreOnlyZip, type ZipEntry } from "../utils/store-only-zip";
import { setPlatformService } from "../services";
import {
  createEpubDraft,
  discardEpubDraft,
  readEpubDraftHistory,
  undoEpubDraftOperation,
} from "./draft";
import { patchEpubChapterInDraft, readEpubChapterFromDraft } from "./chapter";

const encoder = new TextEncoder();

function textEntry(name: string, content: string): ZipEntry {
  return { name, data: encoder.encode(content) };
}

function buildMinimalEpub(): Uint8Array {
  return buildStoreOnlyZip([
    textEntry("mimetype", "application/epub+zip"),
    textEntry(
      "META-INF/container.xml",
      `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>`,
    ),
    textEntry(
      "OPS/package.opf",
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Draftable EPUB</dc:title><dc:creator>Ada Reader</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/></spine></package>`,
    ),
    textEntry(
      "OPS/nav.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter-1.xhtml">Start</a></li></ol></nav></body></html>`,
    ),
    textEntry("OPS/chapter-1.xhtml", "<html><body>Start</body></html>"),
  ]);
}

async function createPlatform(root: string) {
  const dataDir = join(root, "library");
  await mkdir(join(dataDir, "books"), { recursive: true });
  const events: Array<{ kind: string; path: string; bytes?: Uint8Array | string }> = [];

  setPlatformService({
    platformType: "desktop",
    isDesktop: true,
    isMobile: false,
    async readFile(path) {
      events.push({ kind: "readFile", path });
      return readFile(path);
    },
    async writeFile(path, data) {
      events.push({ kind: "writeFile", path, bytes: data });
      await writeFile(path, data);
    },
    async writeTextFile(path, content) {
      events.push({ kind: "writeTextFile", path, bytes: content });
      await writeFile(path, content, "utf8");
    },
    async readTextFile(path) {
      events.push({ kind: "readTextFile", path });
      return readFile(path, "utf8");
    },
    async mkdir(path) {
      events.push({ kind: "mkdir", path });
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

  return { dataDir, events };
}

describe("createEpubDraft", () => {
  beforeEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("copies the source EPUB into a draft workspace without modifying the source", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-draft-"));
    const { dataDir, events } = await createPlatform(root);
    const sourcePath = join(dataDir, "books", "sample.epub");
    const sourceBytes = buildMinimalEpub();
    await writeFile(sourcePath, sourceBytes);

    const book = {
      id: "book-1",
      filePath: "books/sample.epub",
      format: "epub",
      meta: {
        title: "Draftable EPUB",
        author: "Ada Reader",
      },
    } as Book;

    const result = await createEpubDraft(book);

    expect(result.bookId).toBe("book-1");
    expect(result.sourceFilePath).toBe("books/sample.epub");
    expect(result.draftFilePath).toMatch(/^drafts\/epub\/book-1-.+\/source\.epub$/);
    expect(result.manifestPath).toMatch(/^drafts\/epub\/book-1-.+\/manifest\.json$/);
    expect(result.historyPath).toMatch(/^drafts\/epub\/book-1-.+\/history\.jsonl$/);
    expect(result.sourceHash).toHaveLength(64);
    expect(result.inspect.metadata.title).toBe("Draftable EPUB");

    expect(Array.from(await readFile(sourcePath))).toEqual(Array.from(sourceBytes));
    expect(Array.from(await readFile(join(dataDir, result.draftFilePath)))).toEqual(
      Array.from(sourceBytes),
    );

    const manifest = JSON.parse(await readFile(join(dataDir, result.manifestPath), "utf8"));
    expect(manifest).toMatchObject({
      version: 1,
      bookId: "book-1",
      sourceFilePath: "books/sample.epub",
      draftFilePath: result.draftFilePath,
      sourceHash: result.sourceHash,
      status: "draft",
    });

    const history = JSON.parse(await readFile(join(dataDir, result.historyPath), "utf8"));
    expect(history).toMatchObject({
      action: "epub.draft.create",
      bookId: "book-1",
      draftId: result.draftId,
      sourceHash: result.sourceHash,
    });

    expect(events.some((event) => event.kind === "writeFile")).toBe(true);
  });

  it("reads draft operation history", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-draft-"));
    const { dataDir } = await createPlatform(root);
    const sourcePath = join(dataDir, "books", "sample.epub");
    await writeFile(sourcePath, buildMinimalEpub());
    const book = {
      id: "book-1",
      filePath: "books/sample.epub",
      format: "epub",
      meta: { title: "Draftable EPUB" },
    } as Book;
    await createEpubDraft(book, { draftId: "draft-1" });

    const history = await readEpubDraftHistory("draft-1");

    expect(history).toMatchObject({
      draftId: "draft-1",
      bookId: "book-1",
      status: "draft",
      historyPath: "drafts/epub/draft-1/history.jsonl",
      entries: [
        {
          action: "epub.draft.create",
          bookId: "book-1",
          draftId: "draft-1",
        },
      ],
    });
  });

  it("discards a draft and records the operation", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-draft-"));
    const { dataDir } = await createPlatform(root);
    const sourcePath = join(dataDir, "books", "sample.epub");
    await writeFile(sourcePath, buildMinimalEpub());
    const book = {
      id: "book-1",
      filePath: "books/sample.epub",
      format: "epub",
      meta: { title: "Draftable EPUB" },
    } as Book;
    await createEpubDraft(book, { draftId: "draft-1" });

    const discarded = await discardEpubDraft("draft-1", {
      reason: "No longer needed",
      now: new Date("2026-06-16T00:00:00Z"),
    });

    expect(discarded).toMatchObject({
      draftId: "draft-1",
      bookId: "book-1",
      status: "discarded",
      discardedAt: "2026-06-16T00:00:00.000Z",
      manifestPath: "drafts/epub/draft-1/manifest.json",
      historyPath: "drafts/epub/draft-1/history.jsonl",
    });

    const manifest = JSON.parse(
      await readFile(join(dataDir, "drafts", "epub", "draft-1", "manifest.json"), "utf8"),
    );
    expect(manifest.status).toBe("discarded");

    const history = await readEpubDraftHistory("draft-1");
    expect(history.status).toBe("discarded");
    expect(history.entries[history.entries.length - 1]).toMatchObject({
      action: "epub.draft.discard",
      reason: "No longer needed",
    });

    await expect(
      import("./chapter").then(({ readEpubChapterFromDraft }) =>
        readEpubChapterFromDraft("draft-1", "chapter-1"),
      ),
    ).rejects.toThrow(/discarded/i);
  });

  it("undoes a draft patch operation without modifying the source EPUB", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-draft-undo-"));
    const { dataDir } = await createPlatform(root);
    const sourcePath = join(dataDir, "books", "sample.epub");
    const sourceBytes = buildMinimalEpub();
    await writeFile(sourcePath, sourceBytes);
    const book = {
      id: "book-1",
      filePath: "books/sample.epub",
      format: "epub",
      meta: { title: "Draftable EPUB" },
    } as Book;
    await createEpubDraft(book, { draftId: "draft-1" });
    const patched = await patchEpubChapterInDraft(
      "draft-1",
      "chapter-1",
      "<html><body><h1>Changed</h1><p>Edited chapter.</p></body></html>",
      { now: new Date("2026-06-16T00:00:00Z") },
    );

    const changedChapter = await readEpubChapterFromDraft("draft-1", "chapter-1");
    expect(changedChapter.content).toBe("Changed Edited chapter.");

    const undone = await undoEpubDraftOperation("draft-1", patched.operationId, {
      now: new Date("2026-06-16T00:01:00Z"),
    });

    expect(undone).toMatchObject({
      draftId: "draft-1",
      bookId: "book-1",
      operationId: patched.operationId,
      undoneAction: "epub.chapter.patch",
      resourcePath: "OPS/chapter-1.xhtml",
      beforeHash: patched.afterHash,
      afterHash: patched.beforeHash,
      updatedAt: "2026-06-16T00:01:00.000Z",
      changed: true,
      manifestPath: "drafts/epub/draft-1/manifest.json",
      historyPath: "drafts/epub/draft-1/history.jsonl",
    });

    const restoredChapter = await readEpubChapterFromDraft("draft-1", "chapter-1");
    expect(restoredChapter.content).toBe("Start");
    expect(Array.from(await readFile(sourcePath))).toEqual(Array.from(sourceBytes));

    const history = await readEpubDraftHistory("draft-1");
    expect(history.entries).toHaveLength(3);
    expect(history.entries[history.entries.length - 1]).toMatchObject({
      action: "epub.undo",
      operationId: patched.operationId,
      undoneAction: "epub.chapter.patch",
      resourcePath: "OPS/chapter-1.xhtml",
    });

    await expect(undoEpubDraftOperation("draft-1", patched.operationId)).rejects.toThrow(
      /already been undone/i,
    );
  });
});
