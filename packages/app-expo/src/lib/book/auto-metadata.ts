import { extractBookMetadata } from "@/lib/book/metadata-extractor";
import { getPlatformService } from "@readany/core/services";
import type { Book } from "@readany/core/types";
import type { ExtractedBookMetadata } from "@readany/core/utils";

const MOBILE_DETAILS_METADATA_MAX_BYTES = 32 * 1024 * 1024;

export async function extractLocalBookMetadata(book: Book): Promise<ExtractedBookMetadata | null> {
  if (book.syncStatus === "remote" || book.format !== "epub" || !book.filePath) return null;

  try {
    const platform = getPlatformService();
    const appData = await platform.getAppDataDir();
    const filePath = isRelativeAppPath(book.filePath)
      ? await platform.joinPath(appData, book.filePath)
      : book.filePath;
    const fileSize = await getMobileFileSize(filePath);
    if (fileSize > MOBILE_DETAILS_METADATA_MAX_BYTES) {
      console.warn(
        `[BookMetadata] Skip details metadata for large EPUB: ${book.meta.title} (${fileSize} bytes)`,
      );
      return null;
    }

    const fileName = book.filePath.split("/").pop() || `${book.id}.epub`;
    return extractBookMetadata(await platform.readFile(filePath), book.format, fileName);
  } catch (error) {
    console.warn("[BookMetadata] Failed to extract local metadata:", error);
    return null;
  }
}

function isRelativeAppPath(path: string): boolean {
  return (
    !path.startsWith("/") &&
    !path.startsWith("file://") &&
    !path.startsWith("asset://") &&
    !path.startsWith("http")
  );
}

async function getMobileFileSize(path: string): Promise<number> {
  const LegacyFileSystem = await import("expo-file-system/legacy");
  const info = await LegacyFileSystem.getInfoAsync(path);
  return info.exists && !info.isDirectory ? (info.size ?? 0) : 0;
}
