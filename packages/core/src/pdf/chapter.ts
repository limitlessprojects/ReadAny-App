import { getPlatformService } from "../services";

export type PdfPageSummary = {
  source: "pdf";
  id: string;
  bookId: string;
  index: number;
  title: string;
  page: number;
};

export type PdfPageReadResult = PdfPageSummary & {
  source: "pdf";
  content: string;
  contentTruncated: boolean;
  contentLimit: number;
  cfi: string;
};

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

function pageIdFromPage(page: number): string {
  return `page-${page}`;
}

function pageFromChapterId(chapterId: string): number | null {
  const match = /^page-(\d+)$/.exec(chapterId);
  if (!match) return null;
  const page = Number.parseInt(match[1], 10);
  return Number.isFinite(page) && page >= 1 ? page : null;
}

function truncateContent(content: string, limit: number): { content: string; truncated: boolean } {
  if (content.length <= limit) return { content, truncated: false };
  return { content: content.slice(0, limit), truncated: true };
}

function clampContentLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value <= 0) return 12000;
  return Math.min(Math.floor(value), 50000);
}

async function loadPdfDocument(bytes: Uint8Array): Promise<{
  pdf: Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>;
}> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  return { pdf: await loadingTask.promise };
}

async function readPdfBookFile(
  bookId: string,
  bookFilePath: string,
): Promise<Uint8Array> {
  const platform = getPlatformService();
  const dataDir = await platform.getDataDir();
  const absolutePath = await platform.joinPath(dataDir, bookFilePath);
  if (!(await platform.exists(absolutePath))) {
    throw new Error(`Book file was not found for ${bookId}: ${bookFilePath}`);
  }
  return Uint8Array.from(await platform.readFile(absolutePath));
}

export async function listPdfPagesFromBookFile(
  bookId: string,
  bookFilePath: string,
): Promise<PdfPageSummary[]> {
  const bytes = await readPdfBookFile(bookId, bookFilePath);
  const { pdf } = await loadPdfDocument(bytes);
  return Array.from({ length: pdf.numPages }, (_, index) => {
    const page = index + 1;
    return {
      source: "pdf" as const,
      id: pageIdFromPage(page),
      bookId,
      index,
      title: `Page ${page}`,
      page,
    };
  });
}

export async function readPdfPageFromBookFile(
  bookId: string,
  bookFilePath: string,
  chapterId: string,
  options: { contentLimit?: number } = {},
): Promise<PdfPageReadResult | null> {
  const pageNumber = pageFromChapterId(chapterId);
  if (pageNumber === null) return null;

  const bytes = await readPdfBookFile(bookId, bookFilePath);
  const { pdf } = await loadPdfDocument(bytes);
  if (pageNumber > pdf.numPages) return null;

  const page = await pdf.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const content = textContent.items
    .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const limit = clampContentLimit(options.contentLimit);
  const truncated = truncateContent(content, limit);

  return {
    source: "pdf",
    id: pageIdFromPage(pageNumber),
    bookId,
    index: pageNumber - 1,
    title: `Page ${pageNumber}`,
    page: pageNumber,
    cfi: `page:${pageNumber}`,
    content: truncated.content,
    contentTruncated: truncated.truncated,
    contentLimit: limit,
  };
}
