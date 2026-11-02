import { getPlatformService } from "../services";
import { readActiveEpubDraftManifest } from "./draft";
import { sha256Hex, summarizeZipEntries } from "./zip";

export type EpubDiffEntry = {
  path: string;
  status: "added" | "removed" | "modified" | "unchanged";
  sourceSize?: number;
  draftSize?: number;
  sourceHash?: string;
  draftHash?: string;
};

export type EpubDiffResult = {
  draftId: string;
  bookId: string;
  sourceFilePath: string;
  draftFilePath: string;
  sourceHash: string;
  draftHash: string;
  changedCount: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchangedCount: number;
  entries: EpubDiffEntry[];
};

export async function diffEpubDraft(draftId: string): Promise<EpubDiffResult> {
  const platform = getPlatformService();
  const { dataDir, manifest } = await readActiveEpubDraftManifest(draftId);
  const sourcePath = await platform.joinPath(dataDir, manifest.sourceFilePath);
  const draftPath = await platform.joinPath(dataDir, manifest.draftFilePath);
  if (!(await platform.exists(sourcePath))) {
    throw new Error(`EPUB source file was not found: ${manifest.sourceFilePath}`);
  }
  if (!(await platform.exists(draftPath))) {
    throw new Error(`EPUB draft file was not found: ${manifest.draftFilePath}`);
  }

  const [sourceBytes, draftBytes] = await Promise.all([
    platform.readFile(sourcePath),
    platform.readFile(draftPath),
  ]);
  const [sourceEntries, draftEntries] = await Promise.all([
    summarizeZipEntries(sourceBytes),
    summarizeZipEntries(draftBytes),
  ]);

  const sourceMap = new Map(sourceEntries.map((entry) => [entry.path, entry]));
  const draftMap = new Map(draftEntries.map((entry) => [entry.path, entry]));
  const paths = new Set<string>([
    ...sourceEntries.map((entry) => entry.path),
    ...draftEntries.map((entry) => entry.path),
  ]);

  const entries = Array.from(paths)
    .sort((a, b) => a.localeCompare(b))
    .map((path) => {
      const source = sourceMap.get(path);
      const draft = draftMap.get(path);
      if (source && draft) {
        const status = source.sha256 === draft.sha256 ? "unchanged" : "modified";
        return {
          path,
          status,
          sourceSize: source.size,
          draftSize: draft.size,
          sourceHash: source.sha256,
          draftHash: draft.sha256,
        } as EpubDiffEntry;
      }
      if (source) {
        return {
          path,
          status: "removed",
          sourceSize: source.size,
          sourceHash: source.sha256,
        } as EpubDiffEntry;
      }
      return {
        path,
        status: "added",
        draftSize: draft?.size,
        draftHash: draft?.sha256,
      } as EpubDiffEntry;
    });

  const summary = entries.reduce(
    (acc, entry) => {
      acc[`${entry.status}Count` as const] += 1;
      if (entry.status !== "unchanged") acc.changedCount += 1;
      return acc;
    },
    {
      changedCount: 0,
      addedCount: 0,
      removedCount: 0,
      modifiedCount: 0,
      unchangedCount: 0,
    },
  );

  return {
    draftId,
    bookId: manifest.bookId,
    sourceFilePath: manifest.sourceFilePath,
    draftFilePath: manifest.draftFilePath,
    sourceHash: manifest.sourceHash,
    draftHash: await sha256Hex(draftBytes),
    ...summary,
    entries,
  };
}
