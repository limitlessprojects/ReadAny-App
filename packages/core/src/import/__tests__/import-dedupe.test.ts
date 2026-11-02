import { describe, expect, it } from "vitest";

import type { Book } from "../../types";
import {
  createImportDuplicateIndex,
  findDuplicateBookByHash,
  findLikelyDuplicateBook,
  normalizeImportIdentity,
} from "../import-dedupe";

function createBook(overrides: Partial<Book>): Book {
  return {
    id: overrides.id ?? "book-1",
    filePath: overrides.filePath ?? "books/demo.epub",
    format: overrides.format ?? "epub",
    meta: {
      title: overrides.meta?.title ?? "Demo Book",
      author: overrides.meta?.author ?? "Someone",
      coverUrl: overrides.meta?.coverUrl,
    },
    progress: overrides.progress ?? 0,
    isVectorized: overrides.isVectorized ?? false,
    vectorizeProgress: overrides.vectorizeProgress ?? 0,
    tags: overrides.tags ?? [],
    fileHash: overrides.fileHash,
    syncStatus: overrides.syncStatus ?? "local",
    addedAt: overrides.addedAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    lastOpenedAt: overrides.lastOpenedAt ?? 1,
  };
}

describe("import dedupe helpers", () => {
  it("normalizes filenames and punctuation consistently", () => {
    expect(normalizeImportIdentity("  Demo_Book（Vol.1）.epub  ")).toBe("demo book vol 1");
  });

  it("finds duplicates by file hash", () => {
    const existing = createBook({ fileHash: "abc123" });
    const index = createImportDuplicateIndex([existing]);

    expect(findDuplicateBookByHash(index, "abc123")).toEqual(existing);
    expect(findDuplicateBookByHash(index, "missing")).toBeNull();
  });

  it("finds likely duplicates by book title and filename", () => {
    const existing = createBook({
      meta: { title: "Rubbish Theory", author: "Michael Thompson" },
      filePath: "books/Rubbish Theory.epub",
    });
    const index = createImportDuplicateIndex([existing]);

    expect(findLikelyDuplicateBook(index, { name: "Rubbish-Theory.pdf" })).toEqual(existing);
    expect(findLikelyDuplicateBook(index, { title: "Rubbish Theory" })).toEqual(existing);
    expect(findLikelyDuplicateBook(index, { name: "Another Book.epub" })).toBeNull();
  });
});
