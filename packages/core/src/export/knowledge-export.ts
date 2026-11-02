import { getAllHighlights, getAllNotes, getBooks } from "../db";
import { sha256Hex } from "../epub/zip";
import { getPlatformService } from "../services";
import type { Book, Highlight, Note } from "../types";
import { getBookProgressPercent } from "../utils/book-progress";

export type KnowledgeExportFormat = "markdown" | "json" | "obsidian";

export type KnowledgeExportResult = {
  outputPath: string;
  outputHash: string;
  outputSize: number;
  exportedAt: string;
  format: KnowledgeExportFormat;
  bookCount: number;
  noteCount: number;
  highlightCount: number;
};

type KnowledgeBook = {
  book: Book;
  notes: Note[];
  highlights: Highlight[];
};

export async function exportKnowledgeLibrary(options: {
  outputPath: string;
  format?: KnowledgeExportFormat;
  overwrite?: boolean;
  includeBooks?: boolean;
  includeNotes?: boolean;
  includeHighlights?: boolean;
  limit?: number;
  now?: Date;
}): Promise<KnowledgeExportResult> {
  const outputPath = options.outputPath.trim();
  if (!outputPath) {
    throw new Error("Knowledge export requires an output path.");
  }

  const platform = getPlatformService();
  if (!options.overwrite && (await platform.exists(outputPath))) {
    throw new Error(`Knowledge export output already exists: ${outputPath}`);
  }

  const limit = clampLimit(options.limit);
  const includeBooks = options.includeBooks ?? true;
  const includeNotes = options.includeNotes ?? true;
  const includeHighlights = options.includeHighlights ?? true;
  const format = options.format ?? "markdown";
  const exportedAt = (options.now ?? new Date()).toISOString();

  const [books, allNotes, allHighlights] = await Promise.all([
    includeBooks ? getBooks() : Promise.resolve([]),
    includeNotes ? getAllNotes(limit) : Promise.resolve([]),
    includeHighlights ? getAllHighlights(limit) : Promise.resolve([]),
  ]);
  const knowledgeBooks = groupKnowledgeByBook(books, allNotes, allHighlights);
  const content = renderKnowledgeExport(knowledgeBooks, {
    exportedAt,
    format,
    includeBooks,
    includeNotes,
    includeHighlights,
  });

  const outputDir = getParentDir(outputPath);
  if (outputDir) {
    await platform.mkdir(outputDir);
  }
  await platform.writeTextFile(outputPath, content);

  const bytes = new TextEncoder().encode(content);
  return {
    outputPath,
    outputHash: await sha256Hex(bytes),
    outputSize: bytes.byteLength,
    exportedAt,
    format,
    bookCount: books.length,
    noteCount: allNotes.length,
    highlightCount: allHighlights.length,
  };
}

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value <= 0) return 1000;
  return Math.min(Math.floor(value), 10000);
}

function groupKnowledgeByBook(
  books: Book[],
  notes: Note[],
  highlights: Highlight[],
): KnowledgeBook[] {
  const knownBookIds = new Set(books.map((book) => book.id));
  const notesByBook = groupByBookId(notes);
  const highlightsByBook = groupByBookId(highlights);
  const missingBookIds = new Set([
    ...notes.map((note) => note.bookId),
    ...highlights.map((highlight) => highlight.bookId),
  ]);

  for (const bookId of knownBookIds) {
    missingBookIds.delete(bookId);
  }

  return [
    ...books.map((book) => ({
      book,
      notes: notesByBook.get(book.id) ?? [],
      highlights: highlightsByBook.get(book.id) ?? [],
    })),
    ...Array.from(missingBookIds).sort().map((bookId) => ({
      book: createMissingBook(bookId),
      notes: notesByBook.get(bookId) ?? [],
      highlights: highlightsByBook.get(bookId) ?? [],
    })),
  ].sort((a, b) => a.book.meta.title.localeCompare(b.book.meta.title));
}

function groupByBookId<T extends { bookId: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const existing = grouped.get(item.bookId) ?? [];
    existing.push(item);
    grouped.set(item.bookId, existing);
  }
  return grouped;
}

function createMissingBook(bookId: string): Book {
  return {
    id: bookId,
    filePath: "",
    format: "epub",
    meta: {
      title: `Unknown Book (${bookId})`,
      author: "Unknown Author",
    },
    addedAt: 0,
    updatedAt: 0,
    progress: 0,
    isVectorized: false,
    vectorizeProgress: 0,
    tags: [],
    syncStatus: "local",
  };
}

function renderKnowledgeExport(
  books: KnowledgeBook[],
  options: {
    exportedAt: string;
    format: KnowledgeExportFormat;
    includeBooks: boolean;
    includeNotes: boolean;
    includeHighlights: boolean;
  },
): string {
  switch (options.format) {
    case "markdown":
      return renderMarkdown(books, options);
    case "json":
      return renderJson(books, options);
    case "obsidian":
      return renderObsidian(books, options);
    default:
      throw new Error(`Unsupported knowledge export format: ${options.format}`);
  }
}

function renderMarkdown(
  books: KnowledgeBook[],
  options: {
    exportedAt: string;
    includeBooks: boolean;
    includeNotes: boolean;
    includeHighlights: boolean;
  },
): string {
  const noteCount = books.reduce((sum, item) => sum + item.notes.length, 0);
  const highlightCount = books.reduce((sum, item) => sum + item.highlights.length, 0);
  const lines = [
    "# ReadAny Knowledge Export",
    "",
    `**Exported:** ${options.exportedAt}`,
    `**Books:** ${options.includeBooks ? books.length : 0}`,
    `**Notes:** ${options.includeNotes ? noteCount : 0}`,
    `**Highlights:** ${options.includeHighlights ? highlightCount : 0}`,
    "",
    "---",
    "",
  ];

  for (const item of books) {
    lines.push(`## ${item.book.meta.title}`, "");
    if (options.includeBooks) {
      lines.push(...renderBookMetadata(item.book), "");
    }
    if (options.includeHighlights && item.highlights.length > 0) {
      lines.push("### Highlights", "");
      for (const highlight of item.highlights) {
        lines.push(`> ${highlight.text}`, "");
        if (highlight.chapterTitle) lines.push(`_Chapter: ${highlight.chapterTitle}_`, "");
        if (highlight.note) lines.push(`**Note:** ${highlight.note}`, "");
      }
    }
    if (options.includeNotes && item.notes.length > 0) {
      lines.push("### Notes", "");
      for (const note of item.notes) {
        lines.push(`#### ${note.title}`, "");
        if (note.chapterTitle) lines.push(`_Chapter: ${note.chapterTitle}_`, "");
        lines.push(note.content, "");
        if (note.tags.length > 0) lines.push(`Tags: ${note.tags.map((tag) => `#${tag}`).join(" ")}`, "");
      }
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

function renderObsidian(
  books: KnowledgeBook[],
  options: {
    exportedAt: string;
    includeBooks: boolean;
    includeNotes: boolean;
    includeHighlights: boolean;
  },
): string {
  const noteCount = books.reduce((sum, item) => sum + item.notes.length, 0);
  const highlightCount = books.reduce((sum, item) => sum + item.highlights.length, 0);
  return [
    "---",
    "type: readany-knowledge-export",
    `created: ${options.exportedAt}`,
    `books: ${options.includeBooks ? books.length : 0}`,
    `notes: ${options.includeNotes ? noteCount : 0}`,
    `highlights: ${options.includeHighlights ? highlightCount : 0}`,
    "tags:",
    "  - readany",
    "  - knowledge-export",
    "---",
    "",
    renderMarkdown(books, options),
  ].join("\n");
}

function renderJson(
  books: KnowledgeBook[],
  options: {
    exportedAt: string;
    includeBooks: boolean;
    includeNotes: boolean;
    includeHighlights: boolean;
  },
): string {
  return JSON.stringify(
    {
      exportedAt: options.exportedAt,
      books: books.map((item) => ({
        id: item.book.id,
        metadata: options.includeBooks
          ? {
              title: item.book.meta.title,
              author: item.book.meta.author,
              publisher: item.book.meta.publisher,
              language: item.book.meta.language,
              description: item.book.meta.description,
              subjects: item.book.meta.subjects,
              tags: item.book.tags,
              progress: getBookProgressPercent(item.book.progress),
              format: item.book.format,
            }
          : undefined,
        highlights: options.includeHighlights
          ? item.highlights.map((highlight) => ({
              id: highlight.id,
              text: highlight.text,
              note: highlight.note,
              color: highlight.color,
              chapter: highlight.chapterTitle,
              cfi: highlight.cfi,
              createdAt: new Date(highlight.createdAt).toISOString(),
            }))
          : undefined,
        notes: options.includeNotes
          ? item.notes.map((note) => ({
              id: note.id,
              title: note.title,
              content: note.content,
              chapter: note.chapterTitle,
              cfi: note.cfi,
              tags: note.tags,
              createdAt: new Date(note.createdAt).toISOString(),
            }))
          : undefined,
      })),
    },
    null,
    2,
  );
}

function renderBookMetadata(book: Book): string[] {
  const lines = [
    `- Author: ${book.meta.author || "Unknown"}`,
    `- Format: ${book.format}`,
    `- Progress: ${getBookProgressPercent(book.progress)}%`,
  ];
  if (book.meta.language) lines.push(`- Language: ${book.meta.language}`);
  if (book.meta.publisher) lines.push(`- Publisher: ${book.meta.publisher}`);
  if (book.tags.length > 0) lines.push(`- Tags: ${book.tags.join(", ")}`);
  return lines;
}

function getParentDir(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return "";
  return path.slice(0, index);
}
