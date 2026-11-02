/**
 * Tokenizer for BM25 search — supports English, Chinese, Japanese, Korean
 *
 * Features:
 * - English: lowercase + stemming-like normalization
 * - Chinese: character-level + bigram tokenization
 * - Japanese: Hiragana/Katakana + Kanji support
 * - Korean: Hangul support
 * - Mixed language support (e.g., "AI人工智能")
 */

/** Common Chinese stop words */
const CHINESE_STOP_WORDS = new Set([
  "的",
  "了",
  "在",
  "是",
  "我",
  "有",
  "和",
  "就",
  "不",
  "人",
  "都",
  "一",
  "一个",
  "上",
  "也",
  "很",
  "到",
  "说",
  "要",
  "去",
  "你",
  "会",
  "着",
  "没有",
  "看",
  "好",
  "自己",
  "这",
  "他",
  "她",
  "它",
  "们",
  "那",
  "些",
  "什么",
  "怎么",
  "这个",
  "那个",
  "可以",
  "没",
  "把",
  "被",
  "让",
  "给",
  "从",
  "向",
  "对",
  "为",
  "以",
  "与",
  "而",
  "但",
  "或",
  "如果",
  "因为",
  "所以",
  "但是",
  "而且",
  "虽然",
  "尽管",
  "还是",
  "已经",
  "正在",
  "将",
]);

/** Common English stop words */
const ENGLISH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "he",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "that",
  "the",
  "to",
  "was",
  "were",
  "will",
  "with",
  "this",
  "but",
  "they",
  "have",
  "had",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "how",
  "not",
  "no",
  "nor",
  "so",
  "too",
  "very",
  "can",
  "could",
  "may",
  "might",
  "shall",
  "should",
  "would",
  "do",
  "does",
  "did",
  "been",
  "being",
]);

/** Combined stop words */
const STOP_WORDS = new Set([...CHINESE_STOP_WORDS, ...ENGLISH_STOP_WORDS]);

/** Unicode ranges for different scripts */
const CJK_UNIFIED = /[\u4e00-\u9fff]/; // Chinese characters
const CJK_EXTENSION = /[\u3400-\u4dbf]/; // CJK Extension A
const HIRAGANA = /[\u3040-\u309f]/; // Japanese Hiragana
const KATAKANA = /[\u30a0-\u30ff]/; // Japanese Katakana
const HANGUL = /[\uac00-\ud7af]/; // Korean Hangul
const HANGUL_JAMO = /[\u1100-\u11ff]/; // Korean Jamo
const ALPHANUMERIC = /[a-zA-Z0-9]/;

/**
 * Check if a character is CJK (Chinese/Japanese Kanji)
 */
function isCJK(char: string): boolean {
  return CJK_UNIFIED.test(char) || CJK_EXTENSION.test(char);
}

/**
 * Check if a character is Japanese (Hiragana or Katakana)
 */
function isJapanese(char: string): boolean {
  return HIRAGANA.test(char) || KATAKANA.test(char);
}

/**
 * Check if a character is Korean
 */
function isKorean(char: string): boolean {
  return HANGUL.test(char) || HANGUL_JAMO.test(char);
}

/**
 * Check if a character is alphanumeric (English/numbers)
 */
function isAlphanumeric(char: string): boolean {
  return ALPHANUMERIC.test(char);
}

/**
 * Normalize text: lowercase, remove extra whitespace, normalize Unicode
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC") // Normalize Unicode (e.g., full-width to half-width)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract English/number tokens from text
 */
function extractAlphanumericTokens(text: string): string[] {
  const tokens: string[] = [];
  let current = "";

  for (const char of text) {
    if (isAlphanumeric(char)) {
      current += char;
    } else {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Extract CJK character tokens (single characters)
 */
function extractCJKChars(text: string): string[] {
  const tokens: string[] = [];

  for (const char of text) {
    if (isCJK(char)) {
      tokens.push(char);
    }
  }

  return tokens;
}

/**
 * Generate bigrams from CJK text
 * E.g., "人工智能" → ["人工", "智能"]
 */
function generateCJKBigrams(text: string): string[] {
  const bigrams: string[] = [];
  let prevCJK: string | null = null;

  for (const char of text) {
    if (isCJK(char)) {
      if (prevCJK !== null) {
        bigrams.push(prevCJK + char);
      }
      prevCJK = char;
    } else {
      prevCJK = null;
    }
  }

  return bigrams;
}

/**
 * Extract Japanese tokens (Hiragana/Katakana sequences)
 */
function extractJapaneseTokens(text: string): string[] {
  const tokens: string[] = [];
  let current = "";

  for (const char of text) {
    if (isJapanese(char)) {
      current += char;
    } else {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Extract Korean tokens (Hangul sequences)
 */
function extractKoreanTokens(text: string): string[] {
  const tokens: string[] = [];
  let current = "";

  for (const char of text) {
    if (isKorean(char)) {
      current += char;
    } else {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Filter out stop words and short tokens
 */
function filterTokens(tokens: string[], minLength = 1): string[] {
  return tokens.filter((t) => t.length >= minLength && !STOP_WORDS.has(t));
}

/**
 * Tokenize text for BM25 search
 *
 * @param text - Input text
 * @param options - Tokenization options
 * @returns Array of tokens
 *
 * @example
 * tokenize("Hello 世界 AI人工智能")
 * // → ["hello", "世", "界", "ai", "人工", "智能", "世界"]
 */
export function tokenize(
  text: string,
  options: {
    /** Enable bigram generation for CJK (default: true) */
    bigrams?: boolean;
    /** Enable CJK single character tokens (default: true) */
    cjkChars?: boolean;
    /** Enable Japanese tokenization (default: true) */
    japanese?: boolean;
    /** Enable Korean tokenization (default: true) */
    korean?: boolean;
    /** Minimum token length (default: 1) */
    minLength?: number;
    /** Remove stop words (default: true) */
    removeStopWords?: boolean;
  } = {},
): string[] {
  const {
    bigrams = true,
    cjkChars = true,
    japanese = true,
    korean = true,
    minLength = 1,
    removeStopWords = true,
  } = options;

  if (!text || text.trim().length === 0) {
    return [];
  }

  const normalized = normalizeText(text);
  const tokens: string[] = [];

  // Extract English/number tokens
  tokens.push(...extractAlphanumericTokens(normalized));

  // Extract CJK single characters
  if (cjkChars) {
    tokens.push(...extractCJKChars(normalized));
  }

  // Generate CJK bigrams
  if (bigrams) {
    tokens.push(...generateCJKBigrams(normalized));
  }

  // Extract Japanese tokens
  if (japanese) {
    tokens.push(...extractJapaneseTokens(normalized));
  }

  // Extract Korean tokens
  if (korean) {
    tokens.push(...extractKoreanTokens(normalized));
  }

  // Deduplicate and filter
  const uniqueTokens = [...new Set(tokens)];
  return filterTokens(uniqueTokens, removeStopWords ? Math.max(minLength, 1) : minLength);
}

/**
 * Tokenize text for query (simpler, no bigrams for exact matching)
 */
export function tokenizeQuery(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const normalized = normalizeText(text);
  const tokens: string[] = [];

  // Extract English/number tokens
  tokens.push(...extractAlphanumericTokens(normalized));

  // Extract CJK single characters
  tokens.push(...extractCJKChars(normalized));

  // Extract Japanese tokens
  tokens.push(...extractJapaneseTokens(normalized));

  // Extract Korean tokens
  tokens.push(...extractKoreanTokens(normalized));

  // Deduplicate and filter
  const uniqueTokens = [...new Set(tokens)];
  return filterTokens(uniqueTokens, 1);
}

/**
 * Get token frequency map
 */
export function getTokenFrequencies(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  return freq;
}
