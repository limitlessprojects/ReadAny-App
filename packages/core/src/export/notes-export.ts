import { getBook, getHighlights, getNotes } from "../db";
import { AnnotationExporter, type ExportFormat } from "./annotation-exporter";
import { getPlatformService } from "../services";
import { sha256Hex } from "../epub/zip";

export type NotesExportResult = {
  bookId: string;
  outputPath: string;
  outputHash: string;
  outputSize: number;
  exportedAt: string;
  format: ExportFormat;
  noteCount: number;
  highlightCount: number;
};

export async function exportBookNotes(
  bookId: string,
  options: {
    outputPath: string;
    format?: ExportFormat;
    overwrite?: boolean;
    includeNotes?: boolean;
    includeHighlights?: boolean;
    groupByChapter?: boolean;
    now?: Date;
  },
): Promise<NotesExportResult> {
  const outputPath = options.outputPath.trim();
  if (!outputPath) {
    throw new Error("Notes export requires an output path.");
  }

  const platform = getPlatformService();
  if (!options.overwrite && (await platform.exists(outputPath))) {
    throw new Error(`Notes export output already exists: ${outputPath}`);
  }

  const book = await getBook(bookId);
  if (!book) {
    throw new Error(`Book ${bookId} was not found.`);
  }

  const [highlights, notes] = await Promise.all([getHighlights(bookId), getNotes(bookId)]);
  const format = options.format ?? "markdown";
  const content = new AnnotationExporter().export(highlights, notes, book, {
    format,
    includeNotes: options.includeNotes ?? true,
    includeHighlights: options.includeHighlights ?? true,
    groupByChapter: options.groupByChapter ?? true,
  });
  const outputDir = getParentDir(outputPath);
  if (outputDir) {
    await platform.mkdir(outputDir);
  }
  await platform.writeTextFile(outputPath, content);

  const bytes = new TextEncoder().encode(content);
  return {
    bookId,
    outputPath,
    outputHash: await sha256Hex(bytes),
    outputSize: bytes.byteLength,
    exportedAt: (options.now ?? new Date()).toISOString(),
    format,
    noteCount: notes.length,
    highlightCount: highlights.length,
  };
}

function getParentDir(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return "";
  return path.slice(0, index);
}
