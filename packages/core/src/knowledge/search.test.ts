import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Book, Highlight, Note } from "../types";

const dbMocks = vi.hoisted(() => ({
  getBooks: vi.fn(),
  getAllNotes: vi.fn(),
  getAllHighlights: vi.fn(),
  getNotes: vi.fn(),
  getHighlights: vi.fn(),
}));

vi.mock("../db", () => dbMocks);

const { searchKnowledge } = await import("./search");

const book = {
  id: "book-1",
  filePath: "books/agent.epub",
  format: "epub",
  meta: {
    title: "Agent Systems",
    author: "Ada Reader",
    description: "A book about safe agent tool boundaries.",
    language: "en",
  },
  addedAt: 1000,
  updatedAt: 1000,
  progress: 0.5,
  isVectorized: true,
  vectorizeProgress: 1,
  tags: ["agent"],
  syncStatus: "local",
} as Book;

const note: Note = {
  id: "note-1",
  bookId: "book-1",
  title: "Planning note",
  content: "Agents need safe tool boundaries and compact search results.",
  chapterTitle: "Tools",
  cfi: "epubcfi(/6/4)",
  tags: ["agent"],
  createdAt: 2000,
  updatedAt: 2000,
};

const highlight: Highlight = {
  id: "highlight-1",
  bookId: "book-1",
  cfi: "epubcfi(/6/8)",
  text: "Draft-first editing keeps users safe.",
  color: "yellow",
  note: "Important safety point",
  chapterTitle: "Safety",
  createdAt: 3000,
  updatedAt: 3000,
};

describe("searchKnowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getBooks.mockResolvedValue([book]);
    dbMocks.getAllNotes.mockResolvedValue([note]);
    dbMocks.getAllHighlights.mockResolvedValue([highlight]);
    dbMocks.getNotes.mockResolvedValue([note]);
    dbMocks.getHighlights.mockResolvedValue([highlight]);
  });

  it("searches books, notes, and highlights with bounded snippets and references", async () => {
    const result = await searchKnowledge({
      query: "safe",
      limit: 10,
      contentLimit: 40,
    });

    expect(result).toMatchObject({
      query: "safe",
      returned: 3,
      limit: 10,
      results: [
        {
          source: "note",
          id: "note-1",
          bookId: "book-1",
          bookTitle: "Agent Systems",
          reference: {
            bookId: "book-1",
            noteId: "note-1",
            cfi: "epubcfi(/6/4)",
            chapterTitle: "Tools",
          },
        },
        {
          source: "highlight",
          id: "highlight-1",
          reference: {
            bookId: "book-1",
            highlightId: "highlight-1",
            cfi: "epubcfi(/6/8)",
          },
        },
        {
          source: "book",
          id: "book-1",
          reference: {
            bookId: "book-1",
          },
        },
      ],
    });
    expect(result.results.every((item) => item.snippet.length <= 40)).toBe(true);
  });

  it("can scope annotation search to a single book", async () => {
    const result = await searchKnowledge({
      query: "compact",
      bookId: "book-1",
      limit: 5,
    });

    expect(dbMocks.getNotes).toHaveBeenCalledWith("book-1");
    expect(dbMocks.getHighlights).toHaveBeenCalledWith("book-1");
    expect(result.results).toMatchObject([
      {
        source: "note",
        id: "note-1",
      },
    ]);
  });
});
