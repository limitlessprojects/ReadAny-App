import { getPlatformService } from "../services";
import { readActiveEpubDraftManifest } from "./draft";
import { validateEpubDraft, type EpubValidationResult } from "./validate";
import { sha256Hex } from "./zip";

export type EpubExportResult = {
  draftId: string;
  bookId: string;
  outputPath: string;
  outputHash: string;
  outputSize: number;
  exportedAt: string;
  validation: EpubValidationResult;
};

export async function exportEpubDraft(
  draftId: string,
  options: {
    outputPath: string;
    overwrite?: boolean;
    now?: Date;
  },
): Promise<EpubExportResult> {
  const outputPath = options.outputPath.trim();
  if (!outputPath) {
    throw new Error("EPUB export requires an output path.");
  }

  const platform = getPlatformService();
  const { dataDir, manifest } = await readActiveEpubDraftManifest(draftId);
  const draftPath = await platform.joinPath(dataDir, manifest.draftFilePath);
  if (!(await platform.exists(draftPath))) {
    throw new Error(`EPUB draft file was not found: ${manifest.draftFilePath}`);
  }
  if (!options.overwrite && (await platform.exists(outputPath))) {
    throw new Error(`EPUB export output already exists: ${outputPath}`);
  }

  const validation = await validateEpubDraft(draftId, { now: options.now });
  if (!validation.valid) {
    throw new Error(
      `EPUB draft validation failed with ${validation.errorCount} error(s); export was not written.`,
    );
  }

  const bytes = await platform.readFile(draftPath);
  const outputDir = getParentDir(outputPath);
  if (outputDir) {
    await platform.mkdir(outputDir);
  }
  await platform.writeFile(outputPath, bytes);

  return {
    draftId,
    bookId: manifest.bookId,
    outputPath,
    outputHash: await sha256Hex(bytes),
    outputSize: bytes.byteLength,
    exportedAt: (options.now ?? new Date()).toISOString(),
    validation,
  };
}

function getParentDir(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return "";
  return path.slice(0, index);
}
