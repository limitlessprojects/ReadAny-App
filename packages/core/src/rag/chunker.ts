/**
 * Segment-aware chunker — creates chunks directly from TextSegments
 * Each chunk preserves precise CFI references for navigation.
 *
 * Strategy: Group consecutive segments into chunks by token count,
 * preserving per-segment CFIs for paragraph-level navigation.
 */
import type { Chunk } from "../types";
import type { TextSegment } from "./rag-types";

export interface ChunkerConfig {
  targetTokens: number;
  minTokens: number;
  overlapRatio: number;
}

const DEFAULT_CONFIG: ChunkerConfig = {
  targetTokens: 300,
  minTokens: 50,
  overlapRatio: 0.2,
};

/**
 * Create chunks from segments with precise CFI mapping.
 *
 * Each segment has a CFI, so we group consecutive segments into chunks
 * while preserving CFI boundaries.
 */
export function chunkContent(
  _content: string,
  bookId: string,
  chapterIndex: number,
  chapterTitle: string,
  config: ChunkerConfig = DEFAULT_CONFIG,
  segments?: TextSegment[],
): Chunk[] {
  if (!segments || segments.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  let currentTexts: string[] = [];
  let currentCfis: string[] = [];
  let currentTokens = 0;
  let startCfi = "";
  let endCfi = "";
  // Track which segment index each entry in currentTexts corresponds to,
  // so overlap CFI lookups are accurate even when empty segments are skipped.
  let segmentIndices: number[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segText = seg.text.trim();
    if (!segText) continue;

    const segTokens = estimateTokens(segText);

    if (
      currentTokens + segTokens > config.targetTokens &&
      currentTokens >= config.minTokens &&
      currentTexts.length > 0
    ) {
      chunks.push(
        createChunkFromSegments(
          currentTexts.join("\n\n"),
          bookId,
          chapterIndex,
          chapterTitle,
          chunks.length,
          startCfi,
          endCfi,
          currentCfis,
        ),
      );

      const overlapTokens = Math.floor(currentTokens * config.overlapRatio);
      const overlapResult = getOverlapSegments(
        currentTexts,
        segments,
        i,
        overlapTokens,
        segmentIndices,
      );
      currentTexts = overlapResult.texts;
      currentTokens = overlapResult.tokens;
      startCfi = overlapResult.startCfi;
      // Rebuild segmentIndices and currentCfis for the overlap portion
      const overlapLen = currentTexts.length;
      segmentIndices = segmentIndices.slice(segmentIndices.length - overlapLen);
      currentCfis = currentCfis.slice(currentCfis.length - overlapLen);
      endCfi = seg.cfi;
      currentTexts.push(segText);
      currentCfis.push(seg.cfi);
      currentTokens += segTokens;
      segmentIndices.push(i);
    } else {
      if (currentTexts.length === 0) {
        startCfi = seg.cfi;
      }
      currentTexts.push(segText);
      currentCfis.push(seg.cfi);
      currentTokens += segTokens;
      endCfi = seg.cfi;
      segmentIndices.push(i);
    }
  }

  if (currentTokens >= config.minTokens || (currentTexts.length > 0 && chunks.length === 0)) {
    chunks.push(
      createChunkFromSegments(
        currentTexts.join("\n\n"),
        bookId,
        chapterIndex,
        chapterTitle,
        chunks.length,
        startCfi,
        endCfi,
        currentCfis,
      ),
    );
  }

  return chunks;
}

function createChunkFromSegments(
  content: string,
  bookId: string,
  chapterIndex: number,
  chapterTitle: string,
  index: number,
  startCfi: string,
  endCfi: string,
  segmentCfis?: string[],
): Chunk {
  return {
    id: `${bookId}-${chapterIndex}-${index}`,
    bookId,
    chapterIndex,
    chapterTitle,
    content,
    tokenCount: estimateTokens(content),
    startCfi,
    endCfi,
    segmentCfis,
  };
}

function getOverlapSegments(
  currentTexts: string[],
  segments: TextSegment[],
  _currentIndex: number,
  targetTokens: number,
  segmentIndices: number[],
): { texts: string[]; tokens: number; startCfi: string } {
  const targetChars = targetTokens * 4;
  let charCount = 0;
  const overlapTexts: string[] = [];
  let overlapStartIdx = segmentIndices.length;

  for (let i = currentTexts.length - 1; i >= 0; i--) {
    const text = currentTexts[i];
    charCount += text.length;
    overlapTexts.unshift(text);
    overlapStartIdx = i;
    if (charCount >= targetChars) break;
  }

  // Use the tracked segment indices to get the correct CFI
  const actualSegIdx = segmentIndices[overlapStartIdx];
  const startCfi =
    actualSegIdx !== undefined && segments[actualSegIdx]
      ? segments[actualSegIdx].cfi
      : segments[0]?.cfi || "";

  return {
    texts: overlapTexts,
    tokens: estimateTokens(overlapTexts.join("\n\n")),
    startCfi,
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
