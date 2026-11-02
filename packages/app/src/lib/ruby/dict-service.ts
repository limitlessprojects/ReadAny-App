/**
 * Ruby Dictionary Service — handles downloading and managing ruby dictionaries.
 *
 * Downloads two dictionaries for complete pinyin coverage:
 * 1. Word dict (modern.json ~1.9MB) — multi-char word readings with tone sandhi
 * 2. Char dict (pinyin.txt → pinyin-chars.json ~341KB) — single char fallback
 *
 * Dictionaries are stored in {appData}/dicts/{lang}/ and loaded on demand.
 */

import { useRubyStore } from "@readany/core/stores/ruby-store";
import {
  loadPinyinDicts,
  isPinyinDictLoaded,
  PINYIN_WORD_DICT_URL,
  PINYIN_CHAR_DICT_URL,
  PINYIN_WORD_DICT_FILENAME,
  PINYIN_CHAR_DICT_FILENAME,
  LEGACY_DICT_FILENAME,
} from "./pinyin-processor";

/**
 * Get the dictionary directory path for a language.
 */
async function getDictDir(lang: "zh" | "ja"): Promise<string> {
  const { getPlatformService } = await import("@readany/core/services");
  const platform = getPlatformService();
  const appData = await platform.getAppDataDir();
  return `${appData}/dicts/${lang}`;
}

/**
 * Parse mozillazg/pinyin-data format (pinyin.txt) into a char→pinyin JSON object.
 * Format: "U+XXXX: pīnyīn,alt  # 字"
 * Output: { "字": "pīnyīn" } (first reading only, CJK chars only)
 */
function parsePinyinTxt(text: string): Record<string, string> {
  const dict: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) continue;

    const cpStr = trimmed.slice(0, colonIdx).trim(); // "U+XXXX"
    const rest = trimmed.slice(colonIdx + 1).split("#")[0].trim(); // "pīnyīn,alt"

    try {
      const cp = parseInt(cpStr.replace("U+", ""), 16);
      // Only keep CJK range chars
      if (
        (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
        (cp >= 0x3400 && cp <= 0x4dbf) || // Extension A
        (cp >= 0xf900 && cp <= 0xfaff)    // Compatibility
      ) {
        const char = String.fromCodePoint(cp);
        const pinyin = rest.split(",")[0].trim(); // Take first reading
        if (pinyin) dict[char] = pinyin;
      }
    } catch {
      // Skip invalid entries
    }
  }
  return dict;
}

/**
 * Download the Chinese pinyin dictionaries (word + char).
 */
export async function downloadChineseDict(): Promise<void> {
  const store = useRubyStore.getState();
  store.setDictState("zh", { status: "downloading", progress: 0, error: undefined });

  try {
    const { mkdir, writeFile, exists, remove } = await import("@tauri-apps/plugin-fs");
    const dictDir = await getDictDir("zh");

    // Create directory if needed
    if (!(await exists(dictDir))) {
      await mkdir(dictDir, { recursive: true });
    }

    // Clean up legacy single dict file
    const legacyPath = `${dictDir}/${LEGACY_DICT_FILENAME}`;
    if (await exists(legacyPath)) {
      await remove(legacyPath);
    }

    // --- Download word dict (modern.json ~1.9MB) ---
    store.setDictState("zh", { progress: 5 });
    const wordResponse = await fetch(PINYIN_WORD_DICT_URL);
    if (!wordResponse.ok) {
      throw new Error(`Word dict download failed: HTTP ${wordResponse.status}`);
    }

    const wordData = await downloadWithProgress(wordResponse, (pct) => {
      // Word dict is 0-70% of total progress
      store.setDictState("zh", { progress: Math.round(5 + pct * 0.65) });
    });

    const wordPath = `${dictDir}/${PINYIN_WORD_DICT_FILENAME}`;
    await writeFile(wordPath, wordData);

    // --- Download char dict (pinyin.txt ~600KB text → ~341KB JSON) ---
    store.setDictState("zh", { progress: 72 });
    const charResponse = await fetch(PINYIN_CHAR_DICT_URL);
    if (!charResponse.ok) {
      throw new Error(`Char dict download failed: HTTP ${charResponse.status}`);
    }

    const charTextData = await downloadWithProgress(charResponse, (pct) => {
      // Char dict is 70-90% of total progress
      store.setDictState("zh", { progress: Math.round(72 + pct * 0.18) });
    });

    // Parse pinyin.txt → JSON
    store.setDictState("zh", { progress: 92 });
    const charText = new TextDecoder().decode(charTextData);
    const charDict = parsePinyinTxt(charText);
    const charJson = JSON.stringify(charDict);
    const charPath = `${dictDir}/${PINYIN_CHAR_DICT_FILENAME}`;
    await writeFile(charPath, new TextEncoder().encode(charJson));

    // --- Load into memory ---
    store.setDictState("zh", { progress: 95 });
    await loadPinyinDicts(dictDir);

    store.setDictState("zh", { status: "ready", progress: 100, error: undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.setDictState("zh", { status: "error", error: message, progress: 0 });
    throw err;
  }
}

/**
 * Download response body with progress callback.
 */
async function downloadWithProgress(
  response: Response,
  onProgress: (pct: number) => void,
): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get("content-length") || 0);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (contentLength > 0) {
      onProgress(received / contentLength);
    }
  }

  const fullData = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    fullData.set(chunk, offset);
    offset += chunk.length;
  }
  return fullData;
}

/**
 * Delete the Chinese dictionary files.
 */
export async function deleteChineseDict(): Promise<void> {
  try {
    const { remove, exists } = await import("@tauri-apps/plugin-fs");
    const dictDir = await getDictDir("zh");
    if (await exists(dictDir)) {
      await remove(dictDir, { recursive: true });
    }
  } catch {
    // Ignore deletion errors
  }
  useRubyStore.getState().setDictState("zh", { status: "idle", progress: 0, error: undefined });
}

/**
 * Try to load already-downloaded dictionaries on demand.
 * Returns true if dictionaries were found and loaded.
 */
export async function tryLoadExistingDict(lang: "zh" | "ja"): Promise<boolean> {
  if (lang === "zh") {
    // Already loaded
    if (isPinyinDictLoaded()) return true;

    try {
      const { exists } = await import("@tauri-apps/plugin-fs");
      const dictDir = await getDictDir("zh");
      const wordPath = `${dictDir}/${PINYIN_WORD_DICT_FILENAME}`;
      const charPath = `${dictDir}/${PINYIN_CHAR_DICT_FILENAME}`;

      // Check if both files exist (new format)
      if ((await exists(wordPath)) && (await exists(charPath))) {
        await loadPinyinDicts(dictDir);
        useRubyStore.getState().setDictState("zh", { status: "ready", progress: 100 });
        return true;
      }

      // Fallback: check for legacy single dict file
      const legacyPath = `${dictDir}/${LEGACY_DICT_FILENAME}`;
      if (await exists(legacyPath)) {
        // Legacy format — load word dict only (still works, just missing char coverage)
        const { loadWordDict } = await import("./pinyin-processor");
        await loadWordDict(legacyPath);
        useRubyStore.getState().setDictState("zh", { status: "ready", progress: 100 });
        return true;
      }
    } catch {
      // Dict not available
    }
    return false;
  }

  // TODO: Japanese dict loading
  return false;
}

/**
 * Download Japanese kuromoji dictionary.
 * TODO: Implement when adding Japanese support.
 */
export async function downloadJapaneseDict(): Promise<void> {
  throw new Error("Japanese dictionary not yet supported");
}

/**
 * Delete Japanese dictionary.
 */
export async function deleteJapaneseDict(): Promise<void> {
  try {
    const { remove, exists } = await import("@tauri-apps/plugin-fs");
    const dictDir = await getDictDir("ja");
    if (await exists(dictDir)) {
      await remove(dictDir, { recursive: true });
    }
  } catch {
    // Ignore
  }
  useRubyStore.getState().setDictState("ja", { status: "idle", progress: 0, error: undefined });
}
