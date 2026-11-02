import { getAllHighlights, getAllNotes, getBooks, getHighlights, getNotes } from "../db";
import type { Book, Highlight, Note } from "../types";

export type KnowledgeSearchSource = "book" | "note" | "highlight";

export type KnowledgeSearchHit = {
  source: KnowledgeSearchSource;
  id: string;
  bookId: string;
  bookTitle?: string;
  title: string;
  snippet: string;
  score: number;
  reference: {
    bookId: string;
    noteId?: string;
    highlightId?: string;
    cfi?: string;
    chapterTitle?: string;
  };
};

export type KnowledgeSearchResult = {
  query: string;
  returned: number;
  limit: number;
  results: KnowledgeSearchHit[];
};

export async function searchKnowledge(options: {
  query: string;
  bookId?: string;
  limit?: number;
  contentLimit?: number;
  scanLimit?: number;
  includeBooks?: boolean;
  includeNotes?: boolean;
  includeHighlights?: boolean;
}): Promise<KnowledgeSearchResult> {
  const query = options.query.trim();
  if (!query) {
    throw new Error("Knowledge search requires a query.");
  }

  const limit = clampNumber(options.limit, 20, 1, 100);
  const scanLimit = clampNumber(options.scanLimit, 1000, 1, 10000);
  const contentLimit = clampNumber(options.contentLimit, 240, 40, 1000);
  const includeBooks = options.includeBooks ?? true;
  const includeNotes = options.includeNotes ?? true;
  const includeHighlights = options.includeHighlights ?? true;
  const normalizedQuery = normalize(query);

  const books = await getBooks();
  const booksById = new Map(books.map((book) => [book.id, book]));
  const scopedBooks = options.bookId ? books.filter((book) => book.id === options.bookId) : books;
  const [notes, highlights] = await Promise.all([
    includeNotes
      ? options.bookId
        ? getNotes(options.bookId)
        : getAllNotes(scanLimit)
      : Promise.resolve([]),
    includeHighlights
      ? options.bookId
        ? getHighlights(options.bookId)
        : getAllHighlights(scanLimit)
      : Promise.resolve([]),
  ]);

  const results = [
    ...(includeBooks ? searchBooks(scopedBooks, normalizedQuery, contentLimit) : []),
    ...searchNotes(notes, booksById, normalizedQuery, contentLimit),
    ...searchHighlights(highlights, booksById, normalizedQuery, contentLimit),
  ]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);

  return {
    query,
    returned: results.length,
    limit,
    results,
  };
}

function searchBooks(
  books: Book[],
  normalizedQuery: string,
  contentLimit: number,
): KnowledgeSearchHit[] {
  return books
    .map((book): KnowledgeSearchHit | null => {
      const fields = [
        ["title", book.meta.title],
        ["author", book.meta.author],
        ["description", book.meta.description],
        ["tags", book.tags.join(" ")],
        ["subjects", (book.meta.subjects ?? []).join(" ")],
      ] as const;
      const matched = fields.filter(([, value]) => normalize(value).includes(normalizedQuery));
      if (matched.length === 0) return null;
      const bestText = matched.find(([field]) => field === "description")?.[1] || fields
        .map(([, value]) => value)
        .filter(Boolean)
        .join(" ");
      return {
        source: "book" as const,
        id: book.id,
        bookId: book.id,
        bookTitle: book.meta.title,
        title: book.meta.title,
        snippet: makeSnippet(bestText || book.meta.title, normalizedQuery, contentLimit),
        score: scoreMatchedFields(matched.map(([field]) => field)),
        reference: {
          bookId: book.id,
        },
      };
    })
    .filter(isKnowledgeSearchHit);
}

function searchNotes(
  notes: Note[],
  booksById: Map<string, Book>,
  normalizedQuery: string,
  contentLimit: number,
): KnowledgeSearchHit[] {
  return notes
    .map((note): KnowledgeSearchHit | null => {
      const fields = [
        ["title", note.title],
        ["content", note.content],
        ["chapterTitle", note.chapterTitle],
        ["tags", note.tags.join(" ")],
      ] as const;
      const matched = fields.filter(([, value]) => normalize(value).includes(normalizedQuery));
      if (matched.length === 0) return null;
      const book = booksById.get(note.bookId);
      return {
        source: "note" as const,
        id: note.id,
        bookId: note.bookId,
        bookTitle: book?.meta.title,
        title: note.title,
        snippet: makeSnippet(note.content || note.title, normalizedQuery, contentLimit),
        score: scoreMatchedFields(matched.map(([field]) => field)),
        reference: {
          bookId: note.bookId,
          noteId: note.id,
          cfi: note.cfi,
          chapterTitle: note.chapterTitle,
        },
      };
    })
    .filter(isKnowledgeSearchHit);
}

function searchHighlights(
  highlights: Highlight[],
  booksById: Map<string, Book>,
  normalizedQuery: string,
  contentLimit: number,
): KnowledgeSearchHit[] {
  return highlights
    .map((highlight): KnowledgeSearchHit | null => {
      const fields = [
        ["text", highlight.text],
        ["note", highlight.note],
        ["chapterTitle", highlight.chapterTitle],
      ] as const;
      const matched = fields.filter(([, value]) => normalize(value).includes(normalizedQuery));
      if (matched.length === 0) return null;
      const book = booksById.get(highlight.bookId);
      return {
        source: "highlight" as const,
        id: highlight.id,
        bookId: highlight.bookId,
        bookTitle: book?.meta.title,
        title: highlight.chapterTitle || "Highlight",
        snippet: makeSnippet(highlight.text, normalizedQuery, contentLimit),
        score: scoreMatchedFields(matched.map(([field]) => field)),
        reference: {
          bookId: highlight.bookId,
          highlightId: highlight.id,
          cfi: highlight.cfi,
          chapterTitle: highlight.chapterTitle,
        },
      };
    })
    .filter(isKnowledgeSearchHit);
}

function isKnowledgeSearchHit(hit: KnowledgeSearchHit | null): hit is KnowledgeSearchHit {
  return Boolean(hit);
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function scoreField(field: string): number {
  switch (field) {
    case "title":
      return 20;
    case "author":
      return 10;
    case "text":
    case "content":
      return 8;
    case "note":
      return 6;
    case "tags":
    case "subjects":
      return 5;
    case "chapterTitle":
      return 4;
    case "description":
      return 3;
    default:
      return 1;
  }
}

function scoreMatchedFields(fields: readonly string[]): number {
  return Math.max(...fields.map(scoreField));
}

function makeSnippet(text: string, normalizedQuery: string, limit: number): string {
  const normalizedText = text.toLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedQuery);
  if (matchIndex < 0) {
    return trimSnippet(text, limit);
  }
  const prefix = matchIndex > Math.floor(limit / 3) ? "..." : "";
  const suffixBudget = 3;
  const contentBudget = Math.max(0, limit - prefix.length - suffixBudget);
  const start = Math.max(0, matchIndex - Math.floor(contentBudget / 3));
  const end = Math.min(text.length, start + contentBudget);
  const suffix = end < text.length ? "..." : "";
  return trimSnippet(`${prefix}${text.slice(start, end).trim()}${suffix}`, limit);
}

function trimSnippet(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  if (limit <= 3) return ".".repeat(limit);
  return `${trimmed.slice(0, limit - 3).trim()}...`;
}

function clampNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value) || !value) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
