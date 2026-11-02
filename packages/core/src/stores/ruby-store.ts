/**
 * Ruby Annotation Store — manages dictionary downloads and per-book ruby settings.
 *
 * Dictionaries are NOT bundled with the app. Users download them on-demand
 * to keep the app size minimal. Files are stored in {appData}/dicts/{lang}/.
 */
import { create } from "zustand";
import { withPersist } from "./persist";

export type RubyMode = "zh-pinyin" | "zh-zhuyin" | "ja" | null;

export type RubyDictStatus = "idle" | "downloading" | "ready" | "error";

export interface RubyDictState {
  status: RubyDictStatus;
  progress?: number; // 0-100
  error?: string;
}

export interface RubyStoreState {
  // Dictionary status per language
  dictStates: Record<"zh" | "ja", RubyDictState>;

  // Per-book ruby mode (persisted so re-opening book keeps ruby active)
  bookRubySettings: Record<string, RubyMode>;

  // Actions
  setDictState: (lang: "zh" | "ja", state: Partial<RubyDictState>) => void;
  setBookRuby: (bookId: string, mode: RubyMode) => void;
  getBookRuby: (bookId: string) => RubyMode;
}

export const useRubyStore = create<RubyStoreState>()(
  withPersist<RubyStoreState>(
    "ruby-store",
    (set, get) => ({
      dictStates: {
        zh: { status: "idle" },
        ja: { status: "idle" },
      },
      bookRubySettings: {},

      setDictState: (lang: "zh" | "ja", partial: Partial<RubyDictState>) =>
        set((state) => ({
          dictStates: {
            ...state.dictStates,
            [lang]: { ...state.dictStates[lang], ...partial },
          },
        })),

      setBookRuby: (bookId: string, mode: RubyMode) =>
        set((state) => ({
          bookRubySettings: { ...state.bookRubySettings, [bookId]: mode },
        })),

      getBookRuby: (bookId: string) => get().bookRubySettings[bookId] ?? null,
    }),
  ),
);
