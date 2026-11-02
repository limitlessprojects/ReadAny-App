import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Book } from "../types";
import type { IPlatformService } from "../services";
import { setPlatformService } from "../services";
import { buildStoreOnlyZip, type ZipEntry } from "../utils/store-only-zip";
import { createEpubDraft } from "./draft";
import { exportEpubDraft } from "./export";
import { sha256Hex } from "./zip";

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
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Export Draft</dc:title><dc:creator>Ada Reader</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/></spine></package>`,
    ),
    textEntry("OPS/chapter-1.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml"><body>Export me</body></html>`),
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
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Invalid Export</dc:title></metadata><manifest><item id="chapter-1" href="missing.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/></spine></package>`,
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

describe("exportEpubDraft", () => {
  beforeEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("exports a valid active draft to a new EPUB file", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-export-"));
    const dataDir = await createPlatform(root);
    const sourceBytes = buildValidEpub();
    await writeFile(join(dataDir, "books", "valid.epub"), sourceBytes);
    const book = {
      id: "book-1",
      filePath: "books/valid.epub",
      format: "epub",
      meta: { title: "Export Draft" },
    } as Book;
    await createEpubDraft(book, { draftId: "draft-1" });

    const outputPath = join(root, "exports", "valid-export.epub");
    const exported = await exportEpubDraft("draft-1", {
      outputPath,
      now: new Date("2026-06-16T00:00:00Z"),
    });

    expect(exported).toMatchObject({
      draftId: "draft-1",
      bookId: "book-1",
      outputPath,
      outputHash: await sha256Hex(sourceBytes),
      outputSize: sourceBytes.byteLength,
      exportedAt: "2026-06-16T00:00:00.000Z",
      validation: {
        valid: true,
        errorCount: 0,
      },
    });
    expect(Array.from(await readFile(outputPath))).toEqual(Array.from(sourceBytes));
    expect(Array.from(await readFile(join(dataDir, "books", "valid.epub")))).toEqual(
      Array.from(sourceBytes),
    );
  });

  it("does not overwrite export output unless explicitly allowed", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-export-"));
    const dataDir = await createPlatform(root);
    await writeFile(join(dataDir, "books", "valid.epub"), buildValidEpub());
    const book = {
      id: "book-1",
      filePath: "books/valid.epub",
      format: "epub",
      meta: { title: "Export Draft" },
    } as Book;
    await createEpubDraft(book, { draftId: "draft-1" });
    const outputPath = join(root, "exports", "existing.epub");
    await mkdir(join(root, "exports"), { recursive: true });
    await writeFile(outputPath, encoder.encode("existing"));

    await expect(exportEpubDraft("draft-1", { outputPath })).rejects.toThrow(/already exists/i);

    const exported = await exportEpubDraft("draft-1", { outputPath, overwrite: true });
    expect(exported.outputPath).toBe(outputPath);
    expect(await readFile(outputPath)).not.toEqual(encoder.encode("existing"));
  });

  it("refuses to export an invalid draft", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-export-"));
    const dataDir = await createPlatform(root);
    await writeFile(join(dataDir, "books", "invalid.epub"), buildInvalidEpub());
    const book = {
      id: "book-1",
      filePath: "books/invalid.epub",
      format: "epub",
      meta: { title: "Invalid Export" },
    } as Book;
    await createEpubDraft(book, { draftId: "draft-1" });
    const outputPath = join(root, "exports", "invalid-export.epub");

    await expect(exportEpubDraft("draft-1", { outputPath })).rejects.toThrow(
      /validation failed/i,
    );
    await expect(readFile(outputPath)).rejects.toThrow();
  });
});
