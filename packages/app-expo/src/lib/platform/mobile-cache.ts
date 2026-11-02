import { Directory, File, Paths } from "expo-file-system";

export interface ClearMobileCacheResult {
  deletedFiles: number;
  deletedBytes: number;
}

function getFileSize(file: File): number {
  try {
    return file.info().size ?? 0;
  } catch {
    return 0;
  }
}

function deleteEntry(entry: File | Directory): ClearMobileCacheResult {
  if (entry instanceof File) {
    const deletedBytes = getFileSize(entry);
    entry.delete();
    return { deletedFiles: 1, deletedBytes };
  }

  let result: ClearMobileCacheResult = { deletedFiles: 0, deletedBytes: 0 };
  try {
    for (const child of entry.list()) {
      const childResult = deleteEntry(child);
      result = {
        deletedFiles: result.deletedFiles + childResult.deletedFiles,
        deletedBytes: result.deletedBytes + childResult.deletedBytes,
      };
    }
  } catch {
    // Still try deleting the directory itself below.
  }
  entry.delete();
  return result;
}

export async function clearMobileRuntimeCache(): Promise<ClearMobileCacheResult> {
  const cacheDir = new Directory(Paths.cache);
  if (!cacheDir.exists) {
    cacheDir.create({ idempotent: true, intermediates: true });
    return { deletedFiles: 0, deletedBytes: 0 };
  }

  let result: ClearMobileCacheResult = { deletedFiles: 0, deletedBytes: 0 };
  for (const entry of cacheDir.list()) {
    try {
      const entryResult = deleteEntry(entry);
      result = {
        deletedFiles: result.deletedFiles + entryResult.deletedFiles,
        deletedBytes: result.deletedBytes + entryResult.deletedBytes,
      };
    } catch (error) {
      console.warn("[mobile-cache] Failed to delete cache entry:", entry.uri, error);
    }
  }

  cacheDir.create({ idempotent: true, intermediates: true });
  return result;
}

export function formatCacheSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
