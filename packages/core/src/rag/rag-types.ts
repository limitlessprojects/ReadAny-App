/**
 * RAG-specific type definitions.
 * Types that are needed by core modules but whose full implementations
 * (like book-extractor) depend on platform-specific code.
 */

/** A text segment with its corresponding CFI for precise navigation */
export interface TextSegment {
  text: string;
  cfi: string;
}

export interface ChapterData {
  index: number;
  title: string;
  content: string;
  /** Text segments with CFI references for precise location mapping */
  segments: TextSegment[];
}
