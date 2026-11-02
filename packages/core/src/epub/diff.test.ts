import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Book } from "../types";
import type { IPlatformService } from "../services";
import { setPlatformService } from "../services";
import { buildStoreOnlyZip, type ZipEntry } from "../utils/store-only-zip";
import { patchEpubChapterInDraft } from "./chapter";
import { diffEpubDraft } from "./diff";
import { createEpubDraft } from "./draft";
import { patchEpubMetadataInDraft } from "./metadata";
import { sha256Hex } from "./zip";

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
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Diff Draft</dc:title><dc:creator>Ada Reader</dc:creator></metadata><manifest><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/></spine></package>`,
    ),
    textEntry(
      "OPS/chapter-1.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Original</h1><p>Before diff.</p></body></html>`,
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

describe("diffEpubDraft", () => {
  beforeEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("compares draft EPUB entries without exposing absolute paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-diff-"));
    const dataDir = await createPlatform(root);
    const sourcePath = join(dataDir, "books", "sample.epub");
    const sourceBytes = buildEpub();
    await writeFile(sourcePath, sourceBytes);
    const book = {
      id: "book-1",
      filePath: "books/sample.epub",
      format: "epub",
      meta: { title: "Diff Draft" },
    } as Book;
    await createEpubDraft(book, { draftId: "draft-1" });

    const clean = await diffEpubDraft("draft-1");
    expect(clean).toMatchObject({
      draftId: "draft-1",
      bookId: "book-1",
      sourceFilePath: "books/sample.epub",
      draftFilePath: "drafts/epub/draft-1/source.epub",
      sourceHash: await sha256Hex(sourceBytes),
      changedCount: 0,
    });
    expect(clean.entries.every((entry) => entry.status === "unchanged")).toBe(true);

    await patchEpubChapterInDraft(
      "draft-1",
      "chapter-1",
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Updated</h1><p>After diff.</p></body></html>`,
    );
    await patchEpubMetadataInDraft("draft-1", { title: "Diff Draft Revised" });

    const diff = await diffEpubDraft("draft-1");

    expect(diff).toMatchObject({
      draftId: "draft-1",
      bookId: "book-1",
      changedCount: 2,
      modifiedCount: 2,
      addedCount: 0,
      removedCount: 0,
    });
    expect(diff.draftHash).not.toBe(diff.sourceHash);
    expect(diff.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "OPS/chapter-1.xhtml",
          status: "modified",
          sourceHash: expect.any(String),
          draftHash: expect.any(String),
        }),
        expect.objectContaining({
          path: "OPS/package.opf",
          status: "modified",
          sourceHash: expect.any(String),
          draftHash: expect.any(String),
        }),
      ]),
    );
    expect(JSON.stringify(diff)).not.toContain(root);
    expect(await sha256Hex(await readFile(sourcePath))).toBe(await sha256Hex(sourceBytes));
  });
});
