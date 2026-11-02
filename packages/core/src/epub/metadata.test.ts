import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Book } from "../types";
import type { IPlatformService } from "../services";
import { setPlatformService } from "../services";
import { buildStoreOnlyZip, type ZipEntry } from "../utils/store-only-zip";
import { createEpubDraft } from "./draft";
import { patchEpubMetadataInDraft } from "./metadata";

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
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Original Title</dc:title><dc:creator>Ada Reader</dc:creator><dc:language>en</dc:language><dc:subject>AI</dc:subject></metadata><manifest><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/></spine></package>`,
    ),
    textEntry(
      "OPS/chapter-1.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>First Chapter</h1></body></html>`,
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

describe("patchEpubMetadataInDraft", () => {
  beforeEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("patches draft metadata without changing the source EPUB", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-metadata-"));
    const dataDir = await createPlatform(root);
    const sourcePath = join(dataDir, "books", "sample.epub");
    const sourceBytes = buildEpub();
    await writeFile(sourcePath, sourceBytes);
    const book = {
      id: "book-1",
      filePath: "books/sample.epub",
      format: "epub",
      meta: { title: "Original Title" },
    } as Book;
    const draft = await createEpubDraft(book, { draftId: "draft-1" });

    const patched = await patchEpubMetadataInDraft(
      draft.draftId,
      {
        title: "Polished Title",
        creator: "Ada Editor",
        language: "zh-CN",
        publisher: "ReadAny Drafts",
        description: "A cleaned metadata description.",
        subjects: ["AI", "Editing"],
        modified: "2026-06-16T00:00:00Z",
      },
      { now: new Date("2026-06-16T00:00:00.000Z") },
    );

    expect(patched).toMatchObject({
      draftId: "draft-1",
      bookId: "book-1",
      packagePath: "OPS/package.opf",
      changed: true,
      updatedAt: "2026-06-16T00:00:00.000Z",
      fields: ["title", "creator", "language", "publisher", "description", "modified", "subjects"],
      metadata: {
        title: "Polished Title",
        creator: "Ada Editor",
        language: "zh-CN",
        publisher: "ReadAny Drafts",
        description: "A cleaned metadata description.",
        modified: "2026-06-16T00:00:00Z",
        subjects: ["AI", "Editing"],
      },
      manifestPath: "drafts/epub/draft-1/manifest.json",
      historyPath: "drafts/epub/draft-1/history.jsonl",
    });
    expect(patched.beforeHash).toHaveLength(64);
    expect(patched.afterHash).toHaveLength(64);
    expect(patched.afterHash).not.toBe(patched.beforeHash);

    expect(Array.from(await readFile(sourcePath))).toEqual(Array.from(sourceBytes));
    const manifest = JSON.parse(
      await readFile(join(dataDir, "drafts", "epub", "draft-1", "manifest.json"), "utf8"),
    );
    expect(manifest).toMatchObject({
      updatedAt: "2026-06-16T00:00:00.000Z",
      inspect: {
        metadata: {
          title: "Polished Title",
          creator: "Ada Editor",
          subjects: ["AI", "Editing"],
        },
      },
    });

    const historyLines = (
      await readFile(join(dataDir, "drafts", "epub", "draft-1", "history.jsonl"), "utf8")
    ).trim().split("\n").map((line) => JSON.parse(line));
    expect(historyLines).toHaveLength(2);
    expect(historyLines[1]).toMatchObject({
      action: "epub.metadata.patch",
      bookId: "book-1",
      draftId: "draft-1",
      beforeHash: patched.beforeHash,
      afterHash: patched.afterHash,
      fields: patched.fields,
    });
  });
});
