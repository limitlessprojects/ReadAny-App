import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { IPlatformService } from "../services";
import { setPlatformService } from "../services";
import { listPdfPagesFromBookFile, readPdfPageFromBookFile } from "./chapter";

const encoder = new TextEncoder();

function buildSimplePdf(pages: string[]): Uint8Array {
  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];

  for (const text of pages) {
    const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`;
    const contentId = addObject(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds
    .map((id) => `${id} 0 R`)
    .join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(pdf);
}

async function createPlatform(root: string): Promise<string> {
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

describe("PDF chapter fallback", () => {
  beforeEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("lists PDF pages and reads page text with page references", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-pdf-"));
    const dataDir = await createPlatform(root);
    await writeFile(
      join(dataDir, "books", "sample.pdf"),
      buildSimplePdf(["First PDF page for agents", "Second PDF page"]),
    );

    await expect(listPdfPagesFromBookFile("book-1", "books/sample.pdf")).resolves.toMatchObject([
      { source: "pdf", id: "page-1", bookId: "book-1", title: "Page 1", page: 1 },
      { source: "pdf", id: "page-2", bookId: "book-1", title: "Page 2", page: 2 },
    ]);

    await expect(
      readPdfPageFromBookFile("book-1", "books/sample.pdf", "page-1", { contentLimit: 9 }),
    ).resolves.toMatchObject({
      source: "pdf",
      id: "page-1",
      bookId: "book-1",
      page: 1,
      cfi: "page:1",
      content: "First PDF",
      contentTruncated: true,
      contentLimit: 9,
    });
  });

  it("returns null for invalid page chapter ids", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-core-pdf-"));
    const dataDir = await createPlatform(root);
    await writeFile(join(dataDir, "books", "sample.pdf"), buildSimplePdf(["Only page"]));

    await expect(readPdfPageFromBookFile("book-1", "books/sample.pdf", "chapter-1")).resolves.toBeNull();
    await expect(readPdfPageFromBookFile("book-1", "books/sample.pdf", "page-2")).resolves.toBeNull();
  });
});
