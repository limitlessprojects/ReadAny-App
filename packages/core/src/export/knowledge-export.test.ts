import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IPlatformService } from "../services";
import { setPlatformService } from "../services";
import { sha256Hex } from "../epub/zip";

const dbMocks = vi.hoisted(() => ({
  getBooks: vi.fn(),
  getAllNotes: vi.fn(),
  getAllHighlights: vi.fn(),
}));

vi.mock("../db", () => dbMocks);

const { exportKnowledgeLibrary } = await import("./knowledge-export");

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

describe("exportKnowledgeLibrary", () => {
  afterEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("writes a full library export and returns metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-knowledge-export-"));
    await useTestPlatform(root);
    const outputPath = join(root, "exports", "knowledge.md");

    dbMocks.getBooks.mockResolvedValue([
      {
        id: "book-1",
        filePath: "books/a.epub",
        format: "epub",
        meta: { title: "Alpha", author: "Ada Reader", language: "en" },
        addedAt: 1,
        updatedAt: 2,
        progress: 0.5,
        isVectorized: true,
        vectorizeProgress: 1,
        tags: ["alpha"],
        syncStatus: "local",
      },
    ]);
    dbMocks.getAllNotes.mockResolvedValue([
      {
        id: "note-1",
        bookId: "book-1",
        title: "Note",
        content: "Knowledge export keeps context together.",
        tags: ["tools"],
        createdAt: 10,
        updatedAt: 10,
      },
    ]);
    dbMocks.getAllHighlights.mockResolvedValue([
      {
        id: "highlight-1",
        bookId: "book-1",
        text: "Export metadata is enough for agents.",
        color: "yellow",
        createdAt: 11,
        updatedAt: 11,
      },
    ]);

    const exported = await exportKnowledgeLibrary({
      outputPath,
      format: "markdown",
      now: new Date("2026-06-16T00:00:00Z"),
    });
    const content = await readFile(outputPath, "utf8");

    expect(content).toContain("# ReadAny Knowledge Export");
    expect(content).toContain("## Alpha");
    expect(content).toContain("Knowledge export keeps context together.");
    expect(exported).toMatchObject({
      outputPath,
      outputHash: await sha256Hex(new TextEncoder().encode(content)),
      outputSize: new TextEncoder().encode(content).byteLength,
      exportedAt: "2026-06-16T00:00:00.000Z",
      format: "markdown",
      bookCount: 1,
      noteCount: 1,
      highlightCount: 1,
    });
  });

  it("rejects overwriting an existing export unless explicitly allowed", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-knowledge-export-"));
    await useTestPlatform(root);
    const outputPath = join(root, "knowledge.json");
    await writeFile(outputPath, "existing", "utf8");

    await expect(exportKnowledgeLibrary({ outputPath, format: "json" })).rejects.toThrow(
      /already exists/i,
    );
  });
});
