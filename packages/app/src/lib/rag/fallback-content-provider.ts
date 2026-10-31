import { resolveDesktopDataPath } from "@/lib/storage/desktop-library-root";
import { setFallbackContentProvider } from "@readany/core/ai";
import type { Book } from "@readany/core/types";
import { extractBookChapters } from "./book-extractor";

export function registerDesktopFallbackContentProvider(): void {
  setFallbackContentProvider({
    async getChapters(book: Book) {
      const filePath = await resolveDesktopDataPath(book.filePath);
      return extractBookChapters(filePath);
    },
  });
}

/**
 * Web build: book files live in the OPFS-backed WebVFS (library-store writes
 * them through the @tauri-apps/plugin-fs shim). The desktop provider's
 * resolveDesktopDataPath depends on Tauri-only commands (appDataDir), so the
 * web build probes the known VFS locations instead. Without a registered
 * provider every fallback chapter tool fails with "Fallback content provider
 * is not registered" and the AI answers from page context only.
 */
export function registerWebFallbackContentProvider(): void {
  setFallbackContentProvider({
    async getChapters(book: Book) {
      const { exists } = await import("@tauri-apps/plugin-fs");
      const raw = (book.filePath || "").trim();
      if (!raw) throw new Error("Book has no file path");
      const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
      const base = normalized.split("/").pop() || normalized;
      const candidates = [normalized, `data/${normalized}`, `data/books/${base}`, `books/${base}`];
      for (const candidate of candidates) {
        if (await exists(candidate)) {
          return extractBookChapters(candidate);
        }
      }
      throw new Error(`Book file not found in WebVFS (tried: ${candidates.join(", ")})`);
    },
  });
}
