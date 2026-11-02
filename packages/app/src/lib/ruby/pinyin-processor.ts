/**
 * Pinyin Processor — converts Chinese characters to pinyin/zhuyin readings.
 *
 * Uses two dictionaries for complete coverage:
 * 1. Word dict (modern.json ~1.9MB) — multi-char words with accurate tone sandhi
 * 2. Char dict (pinyin-chars.json ~341KB) — single character fallback for full coverage
 *
 * Matching strategy: longest-match-first using word dict, then fall back to char dict.
 */

// CDN URLs
export const PINYIN_WORD_DICT_URL =
  "https://cdn.jsdelivr.net/npm/@pinyin-pro/data@1.3.1/json/modern.json";

// mozillazg/pinyin-data — 26,712 CJK chars with pinyin
export const PINYIN_CHAR_DICT_URL =
  "https://raw.githubusercontent.com/mozillazg/pinyin-data/master/pinyin.txt";

export const PINYIN_WORD_DICT_FILENAME = "pinyin-words.json";
export const PINYIN_CHAR_DICT_FILENAME = "pinyin-chars.json";

// Legacy filename (for backward compat — delete old file if found)
export const LEGACY_DICT_FILENAME = "pinyin-dict.json";

export interface RubyToken {
  /** Original character(s) */
  char: string;
  /** Pronunciation reading (pinyin or zhuyin) */
  reading: string;
  /** Whether this token needs ruby (CJK character) */
  needsRuby: boolean;
}

// Singleton dictionary caches
// Word dict format: { "word": ["pinyin reading", frequency] }
let _wordDict: Record<string, [string, number]> | null = null;
// Char dict format: { "char": "pinyin" }
let _charDict: Record<string, string> | null = null;

/**
 * Load word dictionary (modern.json) from a local file path.
 */
export async function loadWordDict(dictPath: string): Promise<void> {
  const text = await readFileText(dictPath);
  _wordDict = JSON.parse(text);
}

/**
 * Load character dictionary (pinyin-chars.json) from a local file path.
 */
export async function loadCharDict(dictPath: string): Promise<void> {
  const text = await readFileText(dictPath);
  _charDict = JSON.parse(text);
}

/**
 * Load both dictionaries from a directory path.
 */
export async function loadPinyinDicts(dictDir: string): Promise<void> {
  const wordPath = `${dictDir}/${PINYIN_WORD_DICT_FILENAME}`;
  const charPath = `${dictDir}/${PINYIN_CHAR_DICT_FILENAME}`;

  await Promise.all([loadWordDict(wordPath), loadCharDict(charPath)]);
}

/**
 * Helper: read text file (Tauri fs first, then fetch fallback)
 */
async function readFileText(filePath: string): Promise<string> {
  // On Tauri desktop, use readTextFile directly (fetch won't work with bare fs paths)
  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    return await readTextFile(filePath);
  } catch {
    // Not Tauri or readTextFile failed — try fetch as fallback
  }

  const response = await fetch(filePath);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}

/**
 * Set dictionaries directly (for testing or alternative loading)
 */
export function setPinyinDicts(
  wordDict: Record<string, [string, number]> | null,
  charDict: Record<string, string> | null,
): void {
  _wordDict = wordDict;
  _charDict = charDict;
}

/**
 * Check if at least one dictionary is loaded (can annotate)
 */
export function isPinyinDictLoaded(): boolean {
  return _wordDict !== null || _charDict !== null;
}

// Keep legacy compat
export const loadPinyinDict = loadWordDict;

// CJK Unified Ideographs range
const CJK_REGEX = /[一-鿿㐀-䶿豈-﫿]/;

/**
 * Annotate Chinese text with pinyin readings.
 * Strategy: longest-match-first using word dict, then char dict fallback.
 */
export function annotateChinese(
  text: string,
  _mode: "pinyin" | "zhuyin" = "pinyin",
): RubyToken[] {
  if ((!_wordDict && !_charDict) || !text) {
    return [{ char: text, reading: "", needsRuby: false }];
  }

  const tokens: RubyToken[] = [];
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    // Non-CJK characters — pass through
    if (!CJK_REGEX.test(char)) {
      // Collect consecutive non-CJK
      let j = i + 1;
      while (j < text.length && !CJK_REGEX.test(text[j])) j++;
      tokens.push({ char: text.slice(i, j), reading: "", needsRuby: false });
      i = j;
      continue;
    }

    // Try longest match from word dict (up to 4 chars)
    let matched = false;
    if (_wordDict) {
      for (let len = Math.min(4, text.length - i); len >= 2; len--) {
        const word = text.slice(i, i + len);
        const entry = _wordDict[word];
        if (entry) {
          const reading = entry[0]; // entry format: [pinyin, frequency]
          // For multi-char words, split reading by space and assign per char
          const readings = reading.split(" ");
          if (readings.length === word.length) {
            for (let k = 0; k < word.length; k++) {
              tokens.push({ char: word[k], reading: readings[k], needsRuby: true });
            }
          } else {
            // Reading doesn't split evenly — annotate as a group
            tokens.push({ char: word, reading, needsRuby: true });
          }
          i += len;
          matched = true;
          break;
        }
      }
    }

    if (matched) continue;

    // Single char lookup: try word dict first, then char dict
    let reading = "";
    if (_wordDict?.[char]) {
      reading = _wordDict[char][0];
    } else if (_charDict?.[char]) {
      reading = _charDict[char];
    }

    tokens.push({ char, reading, needsRuby: true });
    i++;
  }

  return tokens;
}

/**
 * Convert pinyin to zhuyin (Bopomofo).
 * Basic conversion table for common syllables.
 */
export function pinyinToZhuyin(pinyin: string): string {
  // Simplified conversion — a full implementation would need a complete mapping table
  // For MVP, return pinyin as-is if no conversion available
  return pinyin; // TODO: implement full pinyin→zhuyin mapping
}
