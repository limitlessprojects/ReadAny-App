/**
 * Inverted Index for BM25 search
 *
 * Optimizes search by pre-computing:
 * - Term → Document IDs mapping (inverted index)
 * - Document term frequencies
 * - IDF scores
 *
 * Time complexity:
 * - Build: O(n * m) where n = docs, m = avg tokens per doc
 * - Search: O(k * d) where k = query terms, d = avg docs per term
 *
 * vs. naive approach O(k * n * m) for every query
 */

import { getTokenFrequencies, tokenize } from "./tokenizer";

/** Posting entry: document ID + term frequency */
export interface Posting {
  docId: string;
  tf: number; // term frequency in this document
}

/** Inverted index entry for a term */
export interface IndexEntry {
  /** List of documents containing this term */
  postings: Posting[];
  /** Document frequency (number of docs containing this term) */
  df: number;
  /** Pre-computed IDF score */
  idf: number;
}

/** Document metadata */
export interface DocMeta {
  docId: string;
  /** Token count (document length) */
  length: number;
}

/** Inverted index structure */
export interface InvertedIndex {
  /** Term → IndexEntry mapping */
  termIndex: Map<string, IndexEntry>;
  /** Document metadata */
  docMeta: Map<string, DocMeta>;
  /** Total number of documents */
  totalDocs: number;
  /** Average document length */
  avgDocLength: number;
}

/**
 * Build inverted index from documents
 *
 * @param documents - Array of { id, content } objects
 * @param tokenizeFn - Tokenization function (default: built-in tokenizer)
 * @returns Inverted index
 *
 * @example
 * const index = buildInvertedIndex([
 *   { id: "1", content: "Hello world" },
 *   { id: "2", content: "World of AI" }
 * ]);
 */
export function buildInvertedIndex(
  documents: Array<{ id: string; content: string }>,
  tokenizeFn: (text: string) => string[] = tokenize,
): InvertedIndex {
  const termIndex = new Map<string, IndexEntry>();
  const docMeta = new Map<string, DocMeta>();
  let totalLength = 0;

  for (const doc of documents) {
    const tokens = tokenizeFn(doc.content);
    const tokenFreqs = getTokenFrequencies(tokens);

    // Store document metadata
    docMeta.set(doc.id, { docId: doc.id, length: tokens.length });
    totalLength += tokens.length;

    // Update inverted index
    for (const [term, tf] of tokenFreqs) {
      let entry = termIndex.get(term);
      if (!entry) {
        entry = { postings: [], df: 0, idf: 0 };
        termIndex.set(term, entry);
      }
      entry.postings.push({ docId: doc.id, tf });
      entry.df++;
    }
  }

  const totalDocs = documents.length;
  const avgDocLength = totalDocs > 0 ? totalLength / totalDocs : 0;

  // Pre-compute IDF for all terms
  for (const entry of termIndex.values()) {
    // BM25 IDF formula: log((N - df + 0.5) / (df + 0.5) + 1)
    entry.idf = Math.log((totalDocs - entry.df + 0.5) / (entry.df + 0.5) + 1);
  }

  return { termIndex, docMeta, totalDocs, avgDocLength };
}

/**
 * Search using inverted index with BM25 scoring
 *
 * @param index - Inverted index
 * @param queryTerms - Tokenized query terms
 * @param topK - Maximum number of results
 * @param k1 - BM25 term frequency saturation parameter (default: 1.5)
 * @param b - BM25 document length normalization parameter (default: 0.75)
 * @returns Array of { docId, score } sorted by score descending
 */
export function searchInvertedIndex(
  index: InvertedIndex,
  queryTerms: string[],
  topK: number,
  k1 = 1.5,
  b = 0.75,
): Array<{ docId: string; score: number }> {
  if (queryTerms.length === 0 || index.totalDocs === 0) {
    return [];
  }

  // Accumulate scores for each document
  const scores = new Map<string, number>();

  for (const term of queryTerms) {
    const entry = index.termIndex.get(term);
    if (!entry) continue; // Term not in index

    const { idf, postings } = entry;

    for (const posting of postings) {
      const docLength = index.docMeta.get(posting.docId)?.length ?? 0;

      // BM25 score for this term in this document
      const tf = posting.tf;
      const normalizedTf =
        (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / index.avgDocLength)));
      const termScore = idf * normalizedTf;

      scores.set(posting.docId, (scores.get(posting.docId) || 0) + termScore);
    }
  }

  // Sort by score and return top K
  return Array.from(scores.entries())
    .map(([docId, score]) => ({ docId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Get document IDs that contain ANY of the query terms (for filtering)
 */
export function getMatchingDocIds(index: InvertedIndex, queryTerms: string[]): Set<string> {
  const matchingDocs = new Set<string>();

  for (const term of queryTerms) {
    const entry = index.termIndex.get(term);
    if (!entry) continue;

    for (const posting of entry.postings) {
      matchingDocs.add(posting.docId);
    }
  }

  return matchingDocs;
}

/**
 * Get document IDs that contain ALL of the query terms (AND query)
 */
export function getIntersectingDocIds(index: InvertedIndex, queryTerms: string[]): Set<string> {
  if (queryTerms.length === 0) return new Set();

  // Get docs for first term
  const firstEntry = index.termIndex.get(queryTerms[0]);
  if (!firstEntry) return new Set();

  let result = new Set(firstEntry.postings.map((p) => p.docId));

  // Intersect with docs for remaining terms
  for (let i = 1; i < queryTerms.length; i++) {
    const entry = index.termIndex.get(queryTerms[i]);
    if (!entry) return new Set(); // No docs contain this term

    const termDocs = new Set(entry.postings.map((p) => p.docId));
    result = new Set([...result].filter((id) => termDocs.has(id)));

    if (result.size === 0) return new Set();
  }

  return result;
}

/**
 * Get index statistics
 */
export function getIndexStats(index: InvertedIndex): {
  totalDocs: number;
  totalTerms: number;
  avgDocLength: number;
  avgTermsPerDoc: number;
} {
  let totalTermsInDocs = 0;
  for (const meta of index.docMeta.values()) {
    totalTermsInDocs += meta.length;
  }

  return {
    totalDocs: index.totalDocs,
    totalTerms: index.termIndex.size,
    avgDocLength: index.avgDocLength,
    avgTermsPerDoc: index.totalDocs > 0 ? totalTermsInDocs / index.totalDocs : 0,
  };
}
