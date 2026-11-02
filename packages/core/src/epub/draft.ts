import type { Book } from "../types";
import { generateId } from "../utils/generate-id";
import { getPlatformService } from "../services";
import { inspectEpubBytes, type EpubInspectResult } from "./inspect";
import { readZipTextEntry, replaceZipTextEntry, sha256Hex } from "./zip";

export type EpubDraftManifest = {
  version: 1;
  draftId: string;
  bookId: string;
  sourceFilePath: string;
  draftFilePath: string;
  sourceHash: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "discarded";
  inspect: EpubInspectResult;
};

export type EpubDraftCreateHistoryEntry = {
  id: string;
  timestamp: string;
  action: "epub.draft.create";
  bookId: string;
  draftId: string;
  sourceHash: string;
};

export type EpubDraftPatchHistoryEntry = {
  id: string;
  timestamp: string;
  action: "epub.chapter.patch" | "epub.metadata.patch" | "epub.toc.rebuild";
  bookId: string;
  draftId: string;
  chapterId?: string;
  href?: string;
  beforeHash: string;
  afterHash: string;
  fields?: string[];
  itemCount?: number;
};

export type EpubDraftUndoHistoryEntry = {
  id: string;
  timestamp: string;
  action: "epub.undo";
  bookId: string;
  draftId: string;
  operationId: string;
  undoneAction: EpubDraftPatchHistoryEntry["action"];
  resourcePath: string;
  beforeHash: string;
  afterHash: string;
};

export type EpubDraftDiscardHistoryEntry = {
  id: string;
  timestamp: string;
  action: "epub.draft.discard";
  bookId: string;
  draftId: string;
  reason?: string;
};

export type EpubDraftHistoryEntry =
  | EpubDraftCreateHistoryEntry
  | EpubDraftPatchHistoryEntry
  | EpubDraftUndoHistoryEntry
  | EpubDraftDiscardHistoryEntry;

export type EpubDraftUndoSnapshot = {
  version: 1;
  operationId: string;
  action: EpubDraftPatchHistoryEntry["action"];
  resourcePath: string;
  beforeContent: string;
  beforeHash: string;
  afterHash: string;
};

export type EpubDraftCreateResult = {
  draftId: string;
  bookId: string;
  sourceFilePath: string;
  draftFilePath: string;
  manifestPath: string;
  historyPath: string;
  sourceHash: string;
  createdAt: string;
  inspect: EpubInspectResult;
};

export type EpubDraftHistoryResult = {
  draftId: string;
  bookId: string;
  status: EpubDraftManifest["status"];
  historyPath: string;
  entries: EpubDraftHistoryEntry[];
};

export type EpubDraftDiscardResult = {
  draftId: string;
  bookId: string;
  status: "discarded";
  discardedAt: string;
  operationId: string;
  manifestPath: string;
  historyPath: string;
};

export type EpubDraftUndoResult = {
  draftId: string;
  bookId: string;
  operationId: string;
  undoneAction: EpubDraftPatchHistoryEntry["action"];
  resourcePath: string;
  beforeHash: string;
  afterHash: string;
  undoOperationId: string;
  updatedAt: string;
  changed: boolean;
  manifestPath: string;
  historyPath: string;
};

export async function createEpubDraft(
  book: Book,
  options: {
    now?: Date;
    draftId?: string;
  } = {},
): Promise<EpubDraftCreateResult> {
  if (book.format !== "epub") {
    throw new Error(`Book ${book.id} is ${book.format}; only EPUB drafts are currently supported.`);
  }

  const platform = getPlatformService();
  const dataDir = await platform.getDataDir();
  const sourceAbsolutePath = await platform.joinPath(dataDir, book.filePath);
  if (!(await platform.exists(sourceAbsolutePath))) {
    throw new Error(`Book file was not found for ${book.id}: ${book.filePath}`);
  }

  const sourceBytes = await platform.readFile(sourceAbsolutePath);
  const inspect = await inspectEpubBytes(sourceBytes);
  const sourceHash = await sha256Hex(sourceBytes);
  const draftId = options.draftId ?? generateDraftId(book.id);
  const createdAt = (options.now ?? new Date()).toISOString();
  const draftDir = await platform.joinPath(dataDir, "drafts", "epub", draftId);
  const draftFilePath = `drafts/epub/${draftId}/source.epub`;
  const manifestPath = `drafts/epub/${draftId}/manifest.json`;
  const historyPath = `drafts/epub/${draftId}/history.jsonl`;

  await platform.mkdir(draftDir);
  await platform.writeFile(await platform.joinPath(dataDir, draftFilePath), sourceBytes);

  const manifest: EpubDraftManifest = {
    version: 1,
    draftId,
    bookId: book.id,
    sourceFilePath: book.filePath,
    draftFilePath,
    sourceHash,
    createdAt,
    updatedAt: createdAt,
    status: "draft",
    inspect,
  };
  await platform.writeTextFile(
    await platform.joinPath(dataDir, manifestPath),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const historyEntry: EpubDraftHistoryEntry = {
    id: generateId(),
    timestamp: createdAt,
    action: "epub.draft.create",
    bookId: book.id,
    draftId,
    sourceHash,
  };
  await platform.writeTextFile(
    await platform.joinPath(dataDir, historyPath),
    `${JSON.stringify(historyEntry)}\n`,
  );

  return {
    draftId,
    bookId: book.id,
    sourceFilePath: book.filePath,
    draftFilePath,
    manifestPath,
    historyPath,
    sourceHash,
    createdAt,
    inspect,
  };
}

export async function readEpubDraftHistory(
  draftId: string,
): Promise<EpubDraftHistoryResult> {
  const platform = getPlatformService();
  const dataDir = await platform.getDataDir();
  const manifestPath = await platform.joinPath(dataDir, "drafts", "epub", draftId, "manifest.json");
  const historyPath = await platform.joinPath(dataDir, "drafts", "epub", draftId, "history.jsonl");
  if (!(await platform.exists(manifestPath))) {
    throw new Error(`EPUB draft was not found: ${draftId}`);
  }
  if (!(await platform.exists(historyPath))) {
    throw new Error(`EPUB draft history was not found: ${draftId}`);
  }

  const manifest = JSON.parse(await platform.readTextFile(manifestPath)) as EpubDraftManifest;
  const text = await platform.readTextFile(historyPath);
  const entries = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EpubDraftHistoryEntry);

  return {
    draftId,
    bookId: manifest.bookId,
    status: manifest.status,
    historyPath: `drafts/epub/${draftId}/history.jsonl`,
    entries,
  };
}

export async function discardEpubDraft(
  draftId: string,
  options: { now?: Date; reason?: string } = {},
): Promise<EpubDraftDiscardResult> {
  const platform = getPlatformService();
  const dataDir = await platform.getDataDir();
  const manifestPath = await platform.joinPath(dataDir, "drafts", "epub", draftId, "manifest.json");
  const historyPath = await platform.joinPath(dataDir, "drafts", "epub", draftId, "history.jsonl");
  if (!(await platform.exists(manifestPath))) {
    throw new Error(`EPUB draft was not found: ${draftId}`);
  }
  if (!(await platform.exists(historyPath))) {
    throw new Error(`EPUB draft history was not found: ${draftId}`);
  }

  const manifest = JSON.parse(await platform.readTextFile(manifestPath)) as EpubDraftManifest;
  if (manifest.status === "discarded") {
    throw new Error(`EPUB draft is already discarded: ${draftId}`);
  }

  const discardedAt = (options.now ?? new Date()).toISOString();
  const operationId = generateId();
  const nextManifest: EpubDraftManifest = {
    ...manifest,
    status: "discarded",
    updatedAt: discardedAt,
  };
  await platform.writeTextFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  await appendHistoryLine(historyPath, {
    id: operationId,
    timestamp: discardedAt,
    action: "epub.draft.discard",
    bookId: manifest.bookId,
    draftId,
    reason: options.reason?.trim() || undefined,
  } satisfies EpubDraftDiscardHistoryEntry);

  return {
    draftId,
    bookId: manifest.bookId,
    status: "discarded",
    discardedAt,
    operationId,
    manifestPath: `drafts/epub/${draftId}/manifest.json`,
    historyPath: `drafts/epub/${draftId}/history.jsonl`,
  };
}

export async function writeEpubDraftUndoSnapshot(
  draftId: string,
  snapshot: EpubDraftUndoSnapshot,
): Promise<string> {
  const platform = getPlatformService();
  const dataDir = await platform.getDataDir();
  const snapshotDir = await platform.joinPath(dataDir, "drafts", "epub", draftId, "undo");
  await platform.mkdir(snapshotDir);
  const snapshotPath = await platform.joinPath(snapshotDir, `${snapshot.operationId}.json`);
  await platform.writeTextFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return `drafts/epub/${draftId}/undo/${snapshot.operationId}.json`;
}

export async function undoEpubDraftOperation(
  draftId: string,
  operationId: string,
  options: { now?: Date } = {},
): Promise<EpubDraftUndoResult> {
  const trimmedOperationId = operationId.trim();
  if (!trimmedOperationId) {
    throw new Error("EPUB undo requires an operation id.");
  }

  const platform = getPlatformService();
  const { dataDir, manifestPath, historyPath, manifest } = await readActiveEpubDraftManifest(draftId);
  const history = await readEpubDraftHistory(draftId);
  const target = history.entries.find(
    (entry): entry is EpubDraftPatchHistoryEntry =>
      entry.id === trimmedOperationId &&
      (entry.action === "epub.chapter.patch" ||
        entry.action === "epub.metadata.patch" ||
        entry.action === "epub.toc.rebuild"),
  );
  if (!target) {
    throw new Error(`Undoable EPUB operation was not found: ${trimmedOperationId}`);
  }
  const alreadyUndone = history.entries.some(
    (entry) => entry.action === "epub.undo" && entry.operationId === trimmedOperationId,
  );
  if (alreadyUndone) {
    throw new Error(`EPUB operation has already been undone: ${trimmedOperationId}`);
  }

  const snapshotPath = await platform.joinPath(
    dataDir,
    "drafts",
    "epub",
    draftId,
    "undo",
    `${trimmedOperationId}.json`,
  );
  if (!(await platform.exists(snapshotPath))) {
    throw new Error(`EPUB undo snapshot was not found: ${trimmedOperationId}`);
  }
  const snapshot = JSON.parse(await platform.readTextFile(snapshotPath)) as EpubDraftUndoSnapshot;
  if (
    snapshot.version !== 1 ||
    snapshot.operationId !== target.id ||
    snapshot.action !== target.action ||
    snapshot.beforeHash !== target.beforeHash ||
    snapshot.afterHash !== target.afterHash
  ) {
    throw new Error(`EPUB undo snapshot does not match operation: ${trimmedOperationId}`);
  }

  const draftPath = await platform.joinPath(dataDir, manifest.draftFilePath);
  if (!(await platform.exists(draftPath))) {
    throw new Error(`EPUB draft file was not found: ${manifest.draftFilePath}`);
  }
  const draftBytes = await platform.readFile(draftPath);
  const currentContent = await readZipTextEntry(draftBytes, snapshot.resourcePath);
  if (currentContent === null) {
    throw new Error(`EPUB entry was not found: ${snapshot.resourcePath}`);
  }
  const currentHash = await sha256Hex(new TextEncoder().encode(currentContent));
  if (currentHash !== snapshot.afterHash) {
    throw new Error(
      `EPUB operation cannot be undone because ${snapshot.resourcePath} changed after ${trimmedOperationId}.`,
    );
  }

  const undoOperationId = generateId();
  const updatedAt = (options.now ?? new Date()).toISOString();
  const patchedBytes = await replaceZipTextEntry(draftBytes, snapshot.resourcePath, snapshot.beforeContent);
  await platform.writeFile(draftPath, patchedBytes);

  const nextManifest: EpubDraftManifest = {
    ...manifest,
    updatedAt,
    inspect: await inspectEpubBytes(await platform.readFile(draftPath)),
  };
  await platform.writeTextFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);

  await appendHistoryLine(historyPath, {
    id: undoOperationId,
    timestamp: updatedAt,
    action: "epub.undo",
    bookId: manifest.bookId,
    draftId,
    operationId: trimmedOperationId,
    undoneAction: target.action,
    resourcePath: snapshot.resourcePath,
    beforeHash: snapshot.afterHash,
    afterHash: snapshot.beforeHash,
  } satisfies EpubDraftUndoHistoryEntry);

  return {
    draftId,
    bookId: manifest.bookId,
    operationId: trimmedOperationId,
    undoneAction: target.action,
    resourcePath: snapshot.resourcePath,
    beforeHash: snapshot.afterHash,
    afterHash: snapshot.beforeHash,
    undoOperationId,
    updatedAt,
    changed: snapshot.beforeHash !== snapshot.afterHash,
    manifestPath: `drafts/epub/${draftId}/manifest.json`,
    historyPath: `drafts/epub/${draftId}/history.jsonl`,
  };
}

export async function readActiveEpubDraftManifest(draftId: string): Promise<{
  dataDir: string;
  manifestPath: string;
  historyPath: string;
  manifest: EpubDraftManifest;
}> {
  const platform = getPlatformService();
  const dataDir = await platform.getDataDir();
  const draftDir = await platform.joinPath(dataDir, "drafts", "epub", draftId);
  const manifestPath = await platform.joinPath(draftDir, "manifest.json");
  const historyPath = await platform.joinPath(draftDir, "history.jsonl");
  if (!(await platform.exists(manifestPath))) {
    throw new Error(`EPUB draft was not found: ${draftId}`);
  }

  const manifest = JSON.parse(await platform.readTextFile(manifestPath)) as EpubDraftManifest;
  if (manifest.status === "discarded") {
    throw new Error(`EPUB draft is discarded: ${draftId}`);
  }

  return {
    dataDir,
    manifestPath,
    historyPath,
    manifest,
  };
}

function generateDraftId(bookId: string): string {
  return `${slugify(bookId)}-${generateId()}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "book";
}

async function appendHistoryLine(path: string, entry: unknown): Promise<void> {
  const platform = getPlatformService();
  const existing = (await platform.exists(path)) ? await platform.readTextFile(path) : "";
  await platform.writeTextFile(path, `${existing}${JSON.stringify(entry)}\n`);
}
