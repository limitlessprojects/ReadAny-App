/**
 * Mobile Ruby Dictionary Service — downloads and manages pinyin dictionaries.
 *
 * Uses expo-file-system for downloads and storage.
 * The dict JSON is read from disk and passed to the WebView via bridge.
 */
import * as FileSystem from "expo-file-system/legacy";
import { useRubyStore } from "@readany/core/stores/ruby-store";

const DICT_DIR = `${FileSystem.documentDirectory}dicts/zh/`;
const WORD_DICT_FILENAME = "pinyin-words.json";
const CHAR_DICT_FILENAME = "pinyin-chars.json";

// CDN URLs (same as desktop)
const PINYIN_WORD_DICT_URL =
  "https://cdn.jsdelivr.net/npm/@pinyin-pro/data@1.3.1/json/modern.json";
const PINYIN_CHAR_DICT_URL =
  "https://raw.githubusercontent.com/mozillazg/pinyin-data/master/pinyin.txt";

/**
 * Parse mozillazg/pinyin-data format (pinyin.txt) into a char→pinyin JSON string.
 */
function parsePinyinTxt(text: string): string {
  const dict: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) continue;
    const cpStr = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).split("#")[0].trim();
    try {
      const cp = parseInt(cpStr.replace("U+", ""), 16);
      if (
        (cp >= 0x4e00 && cp <= 0x9fff) ||
        (cp >= 0x3400 && cp <= 0x4dbf) ||
        (cp >= 0xf900 && cp <= 0xfaff)
      ) {
        const char = String.fromCodePoint(cp);
        const pinyin = rest.split(",")[0].trim();
        if (pinyin) dict[char] = pinyin;
      }
    } catch {
      // Skip
    }
  }
  return JSON.stringify(dict);
}

/**
 * Download Chinese dictionaries (word + char).
 */
export async function downloadChineseDictMobile(): Promise<void> {
  const store = useRubyStore.getState();
  store.setDictState("zh", { status: "downloading", progress: 0, error: undefined });

  try {
    // Ensure directory exists
    const dirInfo = await FileSystem.getInfoAsync(DICT_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(DICT_DIR, { intermediates: true });
    }

    // Download word dict (~1.9MB)
    store.setDictState("zh", { progress: 10 });
    const wordResult = await FileSystem.downloadAsync(
      PINYIN_WORD_DICT_URL,
      `${DICT_DIR}${WORD_DICT_FILENAME}`,
    );
    if (wordResult.status !== 200) {
      throw new Error(`Word dict download failed: HTTP ${wordResult.status}`);
    }

    store.setDictState("zh", { progress: 70 });

    // Download char dict (text format, ~600KB) → parse → save as JSON
    const charTextResult = await FileSystem.downloadAsync(
      PINYIN_CHAR_DICT_URL,
      `${DICT_DIR}pinyin-raw.txt`,
    );
    if (charTextResult.status !== 200) {
      throw new Error(`Char dict download failed: HTTP ${charTextResult.status}`);
    }

    store.setDictState("zh", { progress: 85 });

    // Parse and save
    const rawText = await FileSystem.readAsStringAsync(`${DICT_DIR}pinyin-raw.txt`);
    const charJson = parsePinyinTxt(rawText);
    await FileSystem.writeAsStringAsync(`${DICT_DIR}${CHAR_DICT_FILENAME}`, charJson);

    // Clean up raw file
    await FileSystem.deleteAsync(`${DICT_DIR}pinyin-raw.txt`, { idempotent: true });

    store.setDictState("zh", { status: "ready", progress: 100, error: undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.setDictState("zh", { status: "error", error: message, progress: 0 });
    throw err;
  }
}

/**
 * Delete Chinese dictionaries.
 */
export async function deleteChineseDictMobile(): Promise<void> {
  try {
    await FileSystem.deleteAsync(DICT_DIR, { idempotent: true });
  } catch {
    // Ignore
  }
  useRubyStore.getState().setDictState("zh", { status: "idle", progress: 0, error: undefined });
}

/**
 * Check if dictionaries exist on disk.
 * If yes, mark store as "ready" (dict data loaded later on demand).
 */
export async function checkExistingDictMobile(): Promise<boolean> {
  try {
    const wordInfo = await FileSystem.getInfoAsync(`${DICT_DIR}${WORD_DICT_FILENAME}`);
    const charInfo = await FileSystem.getInfoAsync(`${DICT_DIR}${CHAR_DICT_FILENAME}`);
    if (wordInfo.exists && charInfo.exists) {
      useRubyStore.getState().setDictState("zh", { status: "ready", progress: 100 });
      return true;
    }
  } catch {
    // Not available
  }
  return false;
}

/**
 * Read dict files from disk and return as JSON strings (to pass to WebView).
 * Returns null if not available.
 */
export async function readDictStrings(): Promise<{
  wordDict: string | null;
  charDict: string | null;
}> {
  try {
    const wordDict = await FileSystem.readAsStringAsync(`${DICT_DIR}${WORD_DICT_FILENAME}`);
    const charDict = await FileSystem.readAsStringAsync(`${DICT_DIR}${CHAR_DICT_FILENAME}`);
    return { wordDict, charDict };
  } catch {
    return { wordDict: null, charDict: null };
  }
}
