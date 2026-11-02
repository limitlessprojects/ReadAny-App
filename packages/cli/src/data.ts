import { setPlatformService } from "@readany/core/services";
import { getPlatformService } from "@readany/core/services";
import type { Book, Highlight, Note } from "@readany/core/types";
import type { ReadingContext } from "@readany/core/types";
import type { SearchMode } from "@readany/core/types";
import {
  createEpubDraft,
  discardEpubDraft,
  readEpubDraftHistory,
  undoEpubDraftOperation,
  type EpubDraftCreateResult,
} from "@readany/core/epub/draft";
import { diffEpubDraft } from "@readany/core/epub/diff";
import { exportEpubDraft } from "@readany/core/epub/export";
import { inspectEpubBytes, type EpubInspectResult } from "@readany/core/epub/inspect";
import {
  getAllHighlights,
  getAllNotes,
  getBook,
  getBooks,
  getChunks,
  getBookmarks,
  getHighlights,
  getNotes,
  closeDB,
  getSkills,
  initDatabase,
} from "@readany/core/db";
import {
  assertPatchableEpubChapterInDraft,
  patchEpubChapterInDraft,
  readEpubChapterFromBookFile,
  readEpubChapterFromDraft,
  type EpubChapterPatchResult,
} from "@readany/core/epub/chapter";
import {
  listPdfPagesFromBookFile,
  readPdfPageFromBookFile,
  type PdfPageReadResult,
  type PdfPageSummary,
} from "@readany/core/pdf/chapter";
import { patchEpubMetadataInDraft } from "@readany/core/epub/metadata";
import { rebuildEpubTocInDraft } from "@readany/core/epub/toc";
import { validateEpubDraft } from "@readany/core/epub/validate";
import { exportBookNotes } from "@readany/core/export/notes-export";
import type { ExportFormat } from "@readany/core/export/annotation-exporter";
import {
  exportKnowledgeLibrary,
  type KnowledgeExportFormat,
} from "@readany/core/export/knowledge-export";
import { searchKnowledge, type KnowledgeSearchResult } from "@readany/core/knowledge/search";
import { createNodePlatformService } from "./platform/node-platform.js";
import { configureRagSearchForCli } from "./rag-config.js";

let initialized = false;
let initializedHome: string | undefined;

export async function ensureCoreInitialized(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const nextHome = env.READANY_HOME;
  if (initialized && initializedHome === nextHome) return;
  if (initialized) {
    await closeDB();
  }
  setPlatformService(createNodePlatformService(env));
  await initDatabase();
  initialized = true;
  initializedHome = nextHome;
}

export async function resetCoreForTests(): Promise<void> {
  const { clearChunkCache, clearSearchConfiguration } = await import("@readany/core/rag");
  clearChunkCache();
  clearSearchConfiguration();
  await closeDB();
  initialized = false;
  initializedHome = undefined;
}

export async function listBooks(limit = 50, env: NodeJS.ProcessEnv = process.env) {
  await ensureCoreInitialized(env);
  const books = await getBooks();
  return books.slice(0, limit);
}

export async function searchBooks(query: string, limit = 20, env: NodeJS.ProcessEnv = process.env) {
  await ensureCoreInitialized(env);
  const needle = query.trim().toLowerCase();
  const books = await getBooks();
  return books
    .filter((book: Book) => {
      const haystack = [
        book.meta.title,
        book.meta.author,
        book.meta.description,
        ...(book.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    })
    .slice(0, limit);
}

export async function getBookById(bookId: string, env: NodeJS.ProcessEnv = process.env) {
  await ensureCoreInitialized(env);
  return getBook(bookId);
}

export type SearchAnnotationsOptions = {
  query?: string;
  bookId?: string;
  limit?: number;
  env?: NodeJS.ProcessEnv;
};

export async function listHighlights(options: SearchAnnotationsOptions = {}) {
  const { bookId, query, limit = 50, env = process.env } = options;
  await ensureCoreInitialized(env);
  const highlights = bookId ? await getHighlights(bookId) : await getAllHighlights(limit);
  const needle = query?.trim().toLowerCase();
  if (!needle) return highlights.slice(0, limit);
  return highlights
    .filter((highlight) =>
      `${highlight.text} ${highlight.note ?? ""} ${highlight.chapterTitle ?? ""}`
        .toLowerCase()
        .includes(needle),
    )
    .slice(0, limit);
}

export async function listNotes(options: SearchAnnotationsOptions = {}) {
  const { bookId, query, limit = 50, env = process.env } = options;
  await ensureCoreInitialized(env);
  const notes = bookId ? await getNotes(bookId) : await getAllNotes(limit);
  const needle = query?.trim().toLowerCase();
  if (!needle) return notes.slice(0, limit);
  return notes
    .filter((note) =>
      `${note.title} ${note.content} ${note.chapterTitle ?? ""} ${(note.tags ?? []).join(" ")}`
        .toLowerCase()
        .includes(needle),
    )
    .slice(0, limit);
}

export async function listBookmarks(bookId: string, env: NodeJS.ProcessEnv = process.env) {
  await ensureCoreInitialized(env);
  return getBookmarks(bookId);
}

export async function listSkills(env: NodeJS.ProcessEnv = process.env) {
  await ensureCoreInitialized(env);
  return getSkills();
}

export type ReaderContextOptions = {
  env?: NodeJS.ProcessEnv;
  includeSelection?: boolean;
  includeSurroundingText?: boolean;
  includeHighlights?: boolean;
  contentLimit?: number;
};

export type ReaderContextSnapshot = {
  available: boolean;
  context: ReadingContext | null;
};

function clampTextLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || !value || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function trimText(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) : value;
}

function sanitizeReadingContext(
  context: ReadingContext,
  options: {
    includeSelection: boolean;
    includeSurroundingText: boolean;
    includeHighlights: boolean;
    contentLimit?: number;
  },
): ReadingContext {
  const contentLimit = clampTextLimit(options.contentLimit, 12000, 50000);
  return {
    ...context,
    selection:
      options.includeSelection && context.selection
        ? {
            ...context.selection,
            text: trimText(context.selection.text, contentLimit),
          }
        : undefined,
    surroundingText: options.includeSurroundingText
      ? trimText(context.surroundingText || "", contentLimit)
      : "",
    recentHighlights: options.includeHighlights
      ? (context.recentHighlights || []).slice(0, 20).map((highlight) => ({
          ...highlight,
          text: trimText(highlight.text, contentLimit),
          note: highlight.note ? trimText(highlight.note, contentLimit) : undefined,
        }))
      : [],
  };
}

export async function getReaderContextSnapshot(
  options: ReaderContextOptions = {},
): Promise<ReaderContextSnapshot> {
  const {
    env = process.env,
    includeSelection = true,
    includeSurroundingText = true,
    includeHighlights = true,
    contentLimit,
  } = options;
  await ensureCoreInitialized(env);
  const platform = getPlatformService();
  const dataDir = await platform.getDataDir();
  const filePath = await platform.joinPath(dataDir, "readany-store", "reader-context.json");

  try {
    const parsed = JSON.parse(await platform.readTextFile(filePath)) as ReadingContext;
    if (!parsed || typeof parsed.bookId !== "string" || !parsed.bookId.trim()) {
      return { available: false, context: null };
    }
    return {
      available: true,
      context: sanitizeReadingContext(parsed, {
        includeSelection,
        includeSurroundingText,
        includeHighlights,
        contentLimit,
      }),
    };
  } catch {
    return { available: false, context: null };
  }
}

export type EpubInspectBookResult = EpubInspectResult & {
  bookId: string;
  filePath: string;
};

export async function inspectEpubBook(
  bookId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EpubInspectBookResult | null> {
  await ensureCoreInitialized(env);
  const book = await getBook(bookId);
  if (!book) return null;
  if (book.format !== "epub") {
    throw new Error(`Book ${bookId} is ${book.format}; only EPUB inspect is currently supported.`);
  }

  const platform = getPlatformService();
  const dataDir = await platform.getDataDir();
  const absolutePath = await platform.joinPath(dataDir, book.filePath);
  if (!(await platform.exists(absolutePath))) {
    throw new Error(`Book file was not found for ${bookId}: ${book.filePath}`);
  }

  const result = await inspectEpubBytes(await platform.readFile(absolutePath));
  return {
    ...result,
    bookId,
    filePath: book.filePath,
  };
}

export async function createEpubDraftForBook(
  bookId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EpubDraftCreateResult | null> {
  await ensureCoreInitialized(env);
  const book = await getBook(bookId);
  if (!book) return null;
  return createEpubDraft(book);
}

export async function readEpubChapter(options: {
  bookId?: string;
  draftId?: string;
  chapterId: string;
  contentLimit?: number;
  contentFormat?: "text" | "xhtml";
  env?: NodeJS.ProcessEnv;
}): Promise<import("@readany/core/epub/chapter").EpubChapterReadResult | null> {
  const { bookId, draftId, chapterId, contentLimit, contentFormat, env = process.env } = options;
  await ensureCoreInitialized(env);

  if (draftId) {
    return readEpubChapterFromDraft(draftId, chapterId, { contentLimit, contentFormat });
  }

  if (!bookId) return null;
  const book = await getBook(bookId);
  if (!book) return null;
  if (book.format !== "epub") {
    throw new Error(
      `Book ${bookId} is ${book.format}; only EPUB chapter reads are currently supported.`,
    );
  }
  return readEpubChapterFromBookFile(bookId, book.filePath, chapterId, {
    contentLimit,
    contentFormat,
  });
}

export async function patchEpubChapter(options: {
  draftId: string;
  chapterId: string;
  xhtml: string;
  env?: NodeJS.ProcessEnv;
}): Promise<EpubChapterPatchResult> {
  const { draftId, chapterId, xhtml, env = process.env } = options;
  await ensureCoreInitialized(env);
  return patchEpubChapterInDraft(draftId, chapterId, xhtml);
}

export type EpubChapterPatchPlanItem = {
  chapterId: string;
  xhtml: string;
};

export type EpubChaptersPatchResult = {
  draftId: string;
  bookId: string;
  requestedCount: number;
  patchedCount: number;
  changedCount: number;
  patches: EpubChapterPatchResult[];
  manifestPath: string;
  historyPath: string;
};

export async function patchEpubChapters(options: {
  draftId: string;
  patches: unknown;
  env?: NodeJS.ProcessEnv;
}): Promise<EpubChaptersPatchResult> {
  const { draftId, patches, env = process.env } = options;
  const patchPlan = assertEpubChapterPatchPlan(patches);
  await ensureCoreInitialized(env);
  for (const patch of patchPlan) {
    await assertPatchableEpubChapterInDraft(draftId, patch.chapterId, patch.xhtml);
  }

  const results: EpubChapterPatchResult[] = [];
  for (const patch of patchPlan) {
    results.push(await patchEpubChapterInDraft(draftId, patch.chapterId, patch.xhtml));
  }

  const first = results[0];
  if (!first) {
    throw new Error("epub chapters patch requires at least one patch");
  }

  return {
    draftId,
    bookId: first.bookId,
    requestedCount: patchPlan.length,
    patchedCount: results.length,
    changedCount: results.filter((result) => result.changed).length,
    patches: results,
    manifestPath: first.manifestPath,
    historyPath: first.historyPath,
  };
}

export function assertEpubChapterPatchPlan(patches: unknown): EpubChapterPatchPlanItem[] {
  if (!Array.isArray(patches) || patches.length === 0) {
    throw new Error("epub chapters patch requires at least one patch");
  }
  if (patches.length > 50) {
    throw new Error("epub chapters patch accepts at most 50 patches");
  }

  const seenChapterIds = new Set<string>();
  const plan: EpubChapterPatchPlanItem[] = [];
  for (const patch of patches) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error("epub chapters patch requires every patch to be an object");
    }
    const item = patch as Record<string, unknown>;
    if (typeof item.chapterId !== "string" || !item.chapterId.trim()) {
      throw new Error("epub chapters patch requires every patch to include chapterId");
    }
    if (typeof item.xhtml !== "string" || !item.xhtml.trim()) {
      throw new Error("epub chapters patch requires every patch to include xhtml");
    }
    const chapterId = item.chapterId.trim();
    if (seenChapterIds.has(chapterId)) {
      throw new Error(`epub chapters patch contains duplicate chapterId: ${chapterId}`);
    }
    seenChapterIds.add(chapterId);
    plan.push({ chapterId, xhtml: item.xhtml });
  }
  return plan;
}

export async function patchEpubMetadata(options: {
  draftId: string;
  patch: import("@readany/core/epub/metadata").EpubMetadataPatch;
  env?: NodeJS.ProcessEnv;
}): Promise<import("@readany/core/epub/metadata").EpubMetadataPatchResult> {
  const { draftId, patch, env = process.env } = options;
  await ensureCoreInitialized(env);
  return patchEpubMetadataInDraft(draftId, patch);
}

export async function getEpubDraftHistory(
  draftId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<import("@readany/core/epub/draft").EpubDraftHistoryResult> {
  await ensureCoreInitialized(env);
  return readEpubDraftHistory(draftId);
}

export async function discardEpubDraftWorkspace(options: {
  draftId: string;
  reason?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<import("@readany/core/epub/draft").EpubDraftDiscardResult> {
  const { draftId, reason, env = process.env } = options;
  await ensureCoreInitialized(env);
  return discardEpubDraft(draftId, { reason });
}

export async function undoEpubDraftWorkspace(options: {
  draftId: string;
  operationId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<import("@readany/core/epub/draft").EpubDraftUndoResult> {
  const { draftId, operationId, env = process.env } = options;
  await ensureCoreInitialized(env);
  return undoEpubDraftOperation(draftId, operationId);
}

export async function diffEpubDraftWorkspace(
  draftId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<import("@readany/core/epub/diff").EpubDiffResult> {
  await ensureCoreInitialized(env);
  return diffEpubDraft(draftId);
}

export async function rebuildEpubTocWorkspace(
  draftId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<import("@readany/core/epub/toc").EpubTocRebuildResult> {
  await ensureCoreInitialized(env);
  return rebuildEpubTocInDraft(draftId);
}

export async function validateEpubDraftWorkspace(
  draftId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<import("@readany/core/epub/validate").EpubValidationResult> {
  await ensureCoreInitialized(env);
  return validateEpubDraft(draftId);
}

export async function exportEpubDraftWorkspace(options: {
  draftId: string;
  outputPath: string;
  overwrite?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<import("@readany/core/epub/export").EpubExportResult> {
  const { draftId, outputPath, overwrite, env = process.env } = options;
  await ensureCoreInitialized(env);
  return exportEpubDraft(draftId, { outputPath, overwrite });
}

export async function exportBookNotesWorkspace(options: {
  bookId: string;
  outputPath: string;
  format?: ExportFormat;
  overwrite?: boolean;
  includeNotes?: boolean;
  includeHighlights?: boolean;
  groupByChapter?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<import("@readany/core/export/notes-export").NotesExportResult> {
  const {
    bookId,
    outputPath,
    format,
    overwrite,
    includeNotes,
    includeHighlights,
    groupByChapter,
    env = process.env,
  } = options;
  await ensureCoreInitialized(env);
  return exportBookNotes(bookId, {
    outputPath,
    format,
    overwrite,
    includeNotes,
    includeHighlights,
    groupByChapter,
  });
}

export async function exportKnowledgeWorkspace(options: {
  outputPath: string;
  format?: KnowledgeExportFormat;
  overwrite?: boolean;
  includeBooks?: boolean;
  includeNotes?: boolean;
  includeHighlights?: boolean;
  limit?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<import("@readany/core/export/knowledge-export").KnowledgeExportResult> {
  const {
    outputPath,
    format,
    overwrite,
    includeBooks,
    includeNotes,
    includeHighlights,
    limit,
    env = process.env,
  } = options;
  await ensureCoreInitialized(env);
  return exportKnowledgeLibrary({
    outputPath,
    format,
    overwrite,
    includeBooks,
    includeNotes,
    includeHighlights,
    limit,
  });
}

export async function searchKnowledgeWorkspace(options: {
  query: string;
  bookId?: string;
  limit?: number;
  contentLimit?: number;
  scanLimit?: number;
  includeBooks?: boolean;
  includeNotes?: boolean;
  includeHighlights?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<KnowledgeSearchResult> {
  const {
    query,
    bookId,
    limit,
    contentLimit,
    scanLimit,
    includeBooks,
    includeNotes,
    includeHighlights,
    env = process.env,
  } = options;
  await ensureCoreInitialized(env);
  return searchKnowledge({
    query,
    bookId,
    limit,
    contentLimit,
    scanLimit,
    includeBooks,
    includeNotes,
    includeHighlights,
  });
}

export type ChapterListOptions = {
  bookId: string;
  env?: NodeJS.ProcessEnv;
};

export type ChapterGetOptions = ChapterListOptions & {
  chapterId: string;
  contentLimit?: number;
  chunkStart?: number;
  chunkCount?: number;
};

export type IndexedChapterSummary = {
  source: "indexed";
  id: string;
  bookId: string;
  index: number;
  title: string;
  chunkCount: number;
  tokenCount: number;
  startCfi: string;
  endCfi: string;
};

export type IndexedChapter = IndexedChapterSummary & {
  source: "indexed";
  totalChunkCount: number;
  returnedChunkCount: number;
  chunkStart: number;
  rangeTruncated: boolean;
  content: string;
  contentTruncated: boolean;
  chunks: Array<{
    id: string;
    content: string;
    tokenCount: number;
    startCfi: string;
    endCfi: string;
    segmentCfis?: string[];
  }>;
};

export type FallbackChapterSummary = {
  source: "epub";
  id: string;
  bookId: string;
  index: number;
  title: string;
  href: string;
  mediaType?: string;
};

export type ChapterSummary = IndexedChapterSummary | FallbackChapterSummary | PdfPageSummary;
export type ChapterReadResult =
  | IndexedChapter
  | import("@readany/core/epub/chapter").EpubChapterReadResult
  | PdfPageReadResult;

function chapterIdFromIndex(index: number): string {
  return String(index);
}

function getChapterIndexFromId(chapterId: string): number | null {
  const parsed = Number.parseInt(chapterId, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function listIndexedChapters(options: ChapterListOptions): Promise<ChapterSummary[]> {
  const { bookId, env = process.env } = options;
  await ensureCoreInitialized(env);
  const chunks = await getChunks(bookId);
  const chapters = new Map<number, IndexedChapterSummary>();

  for (const chunk of chunks) {
    const existing = chapters.get(chunk.chapterIndex);
    if (!existing) {
      chapters.set(chunk.chapterIndex, {
        source: "indexed",
        id: chapterIdFromIndex(chunk.chapterIndex),
        bookId,
        index: chunk.chapterIndex,
        title: chunk.chapterTitle || `Chapter ${chunk.chapterIndex + 1}`,
        chunkCount: 1,
        tokenCount: chunk.tokenCount,
        startCfi: chunk.startCfi,
        endCfi: chunk.endCfi,
      });
      continue;
    }

    existing.chunkCount += 1;
    existing.tokenCount += chunk.tokenCount;
    if (!existing.startCfi && chunk.startCfi) existing.startCfi = chunk.startCfi;
    if (chunk.endCfi) existing.endCfi = chunk.endCfi;
  }

  const indexed = Array.from(chapters.values()).sort((a, b) => a.index - b.index);
  if (indexed.length > 0) return indexed;
  return listFallbackChapters(bookId, env);
}

export async function getIndexedChapter(
  options: ChapterGetOptions,
): Promise<ChapterReadResult | null> {
  const { bookId, chapterId, contentLimit, chunkStart, chunkCount, env = process.env } = options;

  await ensureCoreInitialized(env);
  const chapterIndex = getChapterIndexFromId(chapterId);
  if (chapterIndex === null) {
    return getFallbackChapter({ bookId, chapterId, contentLimit });
  }

  const allChunks = (await getChunks(bookId)).filter(
    (chunk) => chunk.chapterIndex === chapterIndex,
  );
  if (allChunks.length === 0) {
    return getFallbackChapter({ bookId, chapterId, contentLimit });
  }

  const start = clampPositiveInteger(chunkStart, 1, allChunks.length);
  const requestedCount =
    chunkCount === undefined
      ? allChunks.length
      : clampPositiveInteger(chunkCount, allChunks.length, allChunks.length);
  const chunks = allChunks.slice(start - 1, start - 1 + requestedCount);
  if (chunks.length === 0) return null;

  const maxContentChars = clampPositiveInteger(contentLimit, 12000, 50000);
  const fullContent = chunks.map((chunk) => chunk.content).join("\n\n");
  const content = truncateContent(fullContent, maxContentChars);
  const tokenCount = allChunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
  const first = chunks[0];
  const last = chunks[chunks.length - 1];

  return {
    source: "indexed",
    id: chapterIdFromIndex(chapterIndex),
    bookId,
    index: chapterIndex,
    title: first.chapterTitle || `Chapter ${chapterIndex + 1}`,
    chunkCount: allChunks.length,
    tokenCount,
    totalChunkCount: allChunks.length,
    returnedChunkCount: chunks.length,
    chunkStart: start,
    rangeTruncated: chunks.length < allChunks.length,
    startCfi: first.startCfi,
    endCfi: last.endCfi,
    content: content.content,
    contentTruncated: content.truncated,
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      startCfi: chunk.startCfi,
      endCfi: chunk.endCfi,
      segmentCfis: chunk.segmentCfis,
    })),
  };
}

async function listFallbackChapters(
  bookId: string,
  env: NodeJS.ProcessEnv,
): Promise<ChapterSummary[]> {
  const book = await getBook(bookId);
  if (!book) return [];
  if (book.format === "epub") return listEpubFallbackChapters(bookId, env);
  if (book.format === "pdf") return listPdfPagesFromBookFile(bookId, book.filePath);
  return [];
}

async function listEpubFallbackChapters(
  bookId: string,
  env: NodeJS.ProcessEnv,
): Promise<FallbackChapterSummary[]> {
  const book = await getBook(bookId);
  if (!book || book.format !== "epub") return [];
  const inspect = await inspectEpubBook(bookId, env);
  if (!inspect) return [];
  const packageDir = getPackageDir(inspect.packagePath);
  const tocByHref = new Map<string, string>();
  for (const item of inspect.toc.items) {
    const href = stripHrefFragment(item.href);
    if (href && item.label && !tocByHref.has(href)) {
      tocByHref.set(href, item.label);
    }
  }

  return inspect.spine.items
    .filter((item) => item.idref && item.linear !== "no" && item.mediaType?.includes("html"))
    .map((item, index) => {
      const title = item.href
        ? resolveHrefLookupCandidates(packageDir, item.href)
            .map((href) => tocByHref.get(stripHrefFragment(href)))
            .find((label): label is string => Boolean(label?.trim()))
        : undefined;
      return {
        source: "epub" as const,
        id: item.idref,
        bookId,
        index,
        title: title || `Chapter ${index + 1}`,
        href: item.href ?? "",
        mediaType: item.mediaType,
      };
    });
}

async function getFallbackChapter(options: {
  bookId: string;
  chapterId: string;
  contentLimit?: number;
}): Promise<ChapterReadResult | null> {
  const book = await getBook(options.bookId);
  if (!book) return null;
  if (book.format === "epub") return getEpubFallbackChapter(options);
  if (book.format === "pdf") {
    return readPdfPageFromBookFile(options.bookId, book.filePath, options.chapterId, {
      contentLimit: options.contentLimit,
    });
  }
  return null;
}

async function getEpubFallbackChapter(options: {
  bookId: string;
  chapterId: string;
  contentLimit?: number;
}): Promise<import("@readany/core/epub/chapter").EpubChapterReadResult | null> {
  const book = await getBook(options.bookId);
  if (!book || book.format !== "epub") return null;
  try {
    return await readEpubChapterFromBookFile(options.bookId, book.filePath, options.chapterId, {
      contentLimit: options.contentLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/chapter resource was not found/i.test(message)) return null;
    throw error;
  }
}

function stripHrefFragment(href: string): string {
  return href.split("#")[0];
}

function getPackageDir(packagePath: string): string {
  const index = packagePath.lastIndexOf("/");
  return index >= 0 ? packagePath.slice(0, index + 1) : "";
}

function resolvePackagePath(packageDir: string, href: string): string {
  if (!packageDir) return href;
  return `${packageDir}${href}`.replace(/\/{2,}/g, "/");
}

function resolveHrefLookupCandidates(packageDir: string, href: string): string[] {
  const decodedHref = safeDecodeURIComponent(href);
  const candidates = [
    href,
    decodedHref,
    resolvePackagePath(packageDir, href),
    decodedHref ? resolvePackagePath(packageDir, decodedHref) : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  return Array.from(new Set(candidates));
}

function safeDecodeURIComponent(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export type RagSearchOptions = {
  query: string;
  bookId: string;
  mode?: SearchMode;
  limit?: number;
  contentLimit?: number;
  env?: NodeJS.ProcessEnv;
};

export type RagSearchItem = {
  score: number;
  matchType: SearchMode;
  highlights?: string[];
  chunk: {
    id: string;
    bookId: string;
    chapterIndex: number;
    chapterTitle: string;
    content: string;
    contentTruncated: boolean;
    tokenCount: number;
    startCfi: string;
    endCfi: string;
    segmentCfis?: string[];
  };
};

function clampPositiveInteger(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || !value || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function truncateContent(content: string, limit: number): { content: string; truncated: boolean } {
  if (content.length <= limit) return { content, truncated: false };
  return { content: content.slice(0, limit), truncated: true };
}

export async function searchRag(options: RagSearchOptions): Promise<RagSearchItem[]> {
  const { query, bookId, mode = "bm25", limit, contentLimit, env = process.env } = options;

  await ensureCoreInitialized(env);
  await configureRagSearchForCli(mode, env);
  const { search } = await import("@readany/core/rag");
  const results = await search({
    query,
    bookId,
    mode,
    topK: clampPositiveInteger(limit, 5, 50),
    threshold: 0,
  });
  const maxContentChars = clampPositiveInteger(contentLimit, 1200, 4000);

  return results.map((result) => {
    const content = truncateContent(result.chunk.content, maxContentChars);
    return {
      score: result.score,
      matchType: result.matchType,
      highlights: result.highlights,
      chunk: {
        id: result.chunk.id,
        bookId: result.chunk.bookId,
        chapterIndex: result.chunk.chapterIndex,
        chapterTitle: result.chunk.chapterTitle,
        content: content.content,
        contentTruncated: content.truncated,
        tokenCount: result.chunk.tokenCount,
        startCfi: result.chunk.startCfi,
        endCfi: result.chunk.endCfi,
        segmentCfis: result.chunk.segmentCfis,
      },
    };
  });
}
