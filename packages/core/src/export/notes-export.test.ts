import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book, Highlight, Note } from "../types";
import type { IPlatformService } from "../services";
import { setPlatformService } from "../services";
import { sha256Hex } from "../epub/zip";

const dbMocks = vi.hoisted(() => ({
  getBook: vi.fn(),
  getHighlights: vi.fn(),
  getNotes: vi.fn(),
}));

vi.mock("../db", () => dbMocks);

const { exportBookNotes } = await import("./notes-export");

const book = {
  id: "book-1",
  filePath: "books/book.epub",
  format: "epub",
  meta: {
    title: "Notes Book",
    author: "Ada Reader",
    language: "en",
  },
  addedAt: 1000,
  updatedAt: 1000,
  progress: 0,
  isVectorized: false,
  vectorizeProgress: 0,
  tags: [],
  syncStatus: "local",
} as Book;

const highlight: Highlight = {
  id: "highlight-1",
  bookId: "book-1",
  cfi: "epubcfi(/6/2)",
  text: "A precise sentence worth keeping.",
  color: "yellow",
  note: "Remember this.",
  chapterTitle: "Chapter 1",
  createdAt: 1000,
  updatedAt: 1000,
};

const note: Note = {
  id: "note-1",
  bookId: "book-1",
  title: "Standalone thought",
  content: "This is a longer personal note.",
  chapterTitle: "Chapter 1",
  tags: ["review"],
  createdAt: 2000,
  updatedAt: 2000,
};

async function useTestPlatform(root: string): Promise<void> {
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
      return root;
    },
    async getDataDir() {
      return root;
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
}

describe("exportBookNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getBook.mockResolvedValue(book);
    dbMocks.getHighlights.mockResolvedValue([highlight]);
    dbMocks.getNotes.mockResolvedValue([note]);
  });

  afterEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("writes a single-book notes export and returns file metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-notes-export-"));
    await useTestPlatform(root);
    const outputPath = join(root, "exports", "notes.md");

    const exported = await exportBookNotes("book-1", {
      outputPath,
      now: new Date("2026-06-16T00:00:00Z"),
    });
    const content = await readFile(outputPath, "utf8");

    expect(content).toContain("# Notes Book");
    expect(content).toContain("A precise sentence worth keeping.");
    expect(content).toContain("This is a longer personal note.");
    expect(exported).toMatchObject({
      bookId: "book-1",
      outputPath,
      outputHash: await sha256Hex(new TextEncoder().encode(content)),
      outputSize: new TextEncoder().encode(content).byteLength,
      exportedAt: "2026-06-16T00:00:00.000Z",
      format: "markdown",
      noteCount: 1,
      highlightCount: 1,
    });
  });

  it("does not overwrite an existing export unless explicitly allowed", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-notes-export-"));
    await useTestPlatform(root);
    const outputPath = join(root, "notes.json");
    await writeFile(outputPath, "existing", "utf8");

    await expect(exportBookNotes("book-1", { outputPath, format: "json" })).rejects.toThrow(
      /already exists/i,
    );

    const exported = await exportBookNotes("book-1", {
      outputPath,
      format: "json",
      overwrite: true,
    });
    expect(exported.format).toBe("json");
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
      book: { id: "book-1", title: "Notes Book" },
      highlights: [{ id: "highlight-1" }],
      notes: [{ id: "note-1" }],
    });
  });
});
