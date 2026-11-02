/**
 * Chapter Translator — core logic for translating entire chapters.
 *
 * Supports progressive translation with chunking, caching, cancellation,
 * and both AI (numbered batch) and DeepL providers.
 */

import type { TranslationConfig } from "../types/translation";
import { getFromCache, storeInCache } from "./cache";
import { aiTranslateBatch } from "./providers";
import { deeplTranslate } from "./providers";
import { microsoftTranslate } from "./providers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChapterParagraph {
  /** Unique id within the chapter, e.g. "para_0" */
  id: string;
  /** Raw text content */
  text: string;
  /** HTML tag name of the source element (p, h1, li, …) */
  tagName: string;
}

export interface ChapterTranslationProgress {
  totalChars: number;
  translatedChars: number;
}

export interface ChapterTranslationResult {
  paragraphId: string;
  originalText: string;
  translatedText: string;
}

export interface TranslateChapterOptions {
  paragraphs: ChapterParagraph[];
  sourceLang: string;
  targetLang: string;
  config: TranslationConfig;
  /** Target characters per API call (default 2000) */
  charsPerChunk?: number;
  /** Max concurrent chunk requests (default 2) */
  concurrency?: number;
  /** Called after each chunk is translated */
  onProgress?: (progress: ChapterTranslationProgress) => void;
  /** Called with results for each completed chunk – enables progressive injection */
  onChunkComplete?: (results: ChapterTranslationResult[]) => void;
  /** Abort signal – checked between chunks */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Helper: split paragraphs into chunks by character count
// ---------------------------------------------------------------------------

function splitByCharCount(
  paragraphs: ChapterParagraph[],
  targetChars: number,
): ChapterParagraph[][] {
  const chunks: ChapterParagraph[][] = [];
  let currentChunk: ChapterParagraph[] = [];
  let currentChars = 0;

  for (const para of paragraphs) {
    const paraLen = para.text.length;

    if (currentChunk.length === 0) {
      currentChunk.push(para);
      currentChars = paraLen;
    } else if (currentChars + paraLen <= targetChars) {
      currentChunk.push(para);
      currentChars += paraLen;
    } else {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      currentChunk = [para];
      currentChars = paraLen;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function translateChapter(
  options: TranslateChapterOptions,
): Promise<ChapterTranslationResult[]> {
  const {
    paragraphs,
    sourceLang,
    targetLang,
    config,
    charsPerChunk = 2000,
    concurrency = 2,
    onProgress,
    onChunkComplete,
    signal,
  } = options;

  const providerId = config.provider.id;

  // Calculate total characters for progress
  const totalChars = paragraphs.reduce((sum, p) => sum + p.text.length, 0);

  // 1. Check cache for each paragraph -----------------------------------------
  const allResults: ChapterTranslationResult[] = [];
  const uncachedParas: ChapterParagraph[] = [];

  await Promise.all(
    paragraphs.map(async (p) => {
      const cached = await getFromCache(p.text, sourceLang, targetLang, providerId);
      if (cached) {
        allResults.push({
          paragraphId: p.id,
          originalText: p.text,
          translatedText: cached,
        });
      } else {
        uncachedParas.push(p);
      }
    }),
  );

  // Emit cached results immediately so the UI can render them
  if (allResults.length > 0) {
    onChunkComplete?.(allResults);
  }

  // Report progress for cached results
  const cachedChars = allResults.reduce((sum, r) => sum + r.originalText.length, 0);
  let translatedChars = cachedChars;
  onProgress?.({ totalChars, translatedChars });

  if (uncachedParas.length === 0) {
    return allResults;
  }

  // 2. Split uncached paragraphs into chunks by character count ---------------
  const chunks = splitByCharCount(uncachedParas, charsPerChunk);

  console.log(
    `[translateChapter] Split ${uncachedParas.length} paragraphs into ${chunks.length} chunks (target: ${charsPerChunk} chars/chunk)`,
  );

  // 3. Process chunks with bounded concurrency ---------------------------------
  const newResults: ChapterTranslationResult[] = [];
  let chunkIndex = 0;

  async function processNextChunk(): Promise<void> {
    while (chunkIndex < chunks.length) {
      if (signal?.aborted) return;

      const idx = chunkIndex++;
      const chunk = chunks[idx];
      const texts = chunk.map((p) => p.text);

      let translatedTexts: string[];

      try {
        if (providerId === "microsoft") {
          translatedTexts = await microsoftTranslate(texts, sourceLang, targetLang);
        } else if (providerId === "ai") {
          translatedTexts = await aiTranslateBatch(
            texts,
            sourceLang,
            targetLang,
            config.provider.apiKey || "",
            config.provider.baseUrl || "",
            config.provider.model || "",
            config.provider.useExactRequestUrl || false,
          );
        } else {
          // DeepL — natively supports batch
          translatedTexts = await deeplTranslate(
            texts,
            sourceLang,
            targetLang,
            config.provider.apiKey || "",
            config.provider.baseUrl,
          );
        }
      } catch (err) {
        // On error, fill with empty strings so we don't break the loop
        console.error("[translateChapter] chunk error:", err);
        translatedTexts = texts.map(() => "");
      }

      // Store results + cache
      const chunkResults: ChapterTranslationResult[] = [];
      for (let i = 0; i < chunk.length; i++) {
        const result: ChapterTranslationResult = {
          paragraphId: chunk[i].id,
          originalText: chunk[i].text,
          translatedText: translatedTexts[i] || "",
        };
        chunkResults.push(result);
        newResults.push(result);

        if (translatedTexts[i]) {
          storeInCache(chunk[i].text, translatedTexts[i], sourceLang, targetLang, providerId).catch(
            (err) => console.warn("[Translation] Failed to cache translation result:", err),
          );
        }
      }

      // Update progress based on characters translated
      const chunkChars = chunk.reduce((sum, p) => sum + p.text.length, 0);
      translatedChars += chunkChars;
      onProgress?.({ totalChars, translatedChars });
      onChunkComplete?.(chunkResults);
    }
  }

  // Launch `concurrency` workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, chunks.length); i++) {
    workers.push(processNextChunk());
  }
  await Promise.all(workers);

  return [...allResults, ...newResults];
}
