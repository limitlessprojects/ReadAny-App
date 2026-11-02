import type { Highlight, HighlightColor } from "../types";
import { generateId } from "../utils/generate-id";

interface ExistingHighlightRef {
  id: string;
}

export interface SelectionNoteMutationInput {
  bookId: string;
  cfi: string;
  text: string;
  note: string;
  chapterTitle?: string;
  existingHighlight?: ExistingHighlightRef | null;
  defaultColor?: HighlightColor;
  now?: number;
}

export type SelectionNoteMutation =
  | {
      kind: "create";
      highlight: Highlight;
    }
  | {
      kind: "update";
      id: string;
      updates: Pick<Highlight, "note" | "updatedAt">;
    };

export function createSelectionNoteMutation(
  input: SelectionNoteMutationInput,
): SelectionNoteMutation {
  const timestamp = input.now ?? Date.now();
  const normalizedNote = input.note.trim() || undefined;

  if (input.existingHighlight) {
    return {
      kind: "update",
      id: input.existingHighlight.id,
      updates: {
        note: normalizedNote,
        updatedAt: timestamp,
      },
    };
  }

  return {
    kind: "create",
    highlight: {
      id: generateId(),
      bookId: input.bookId,
      cfi: input.cfi,
      text: input.text,
      color: input.defaultColor ?? "yellow",
      note: normalizedNote,
      chapterTitle: input.chapterTitle,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}
