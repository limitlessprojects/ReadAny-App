import { create } from "zustand";
/**
 * Reader store — per-tab reading state, progress, CFI
 */
import type { TOCItem } from "../types";

export interface NavigationHistoryItem {
  cfi: string;
  chapterIndex: number;
  chapterTitle: string;
  timestamp: number;
}

export interface ReaderTab {
  bookId: string;
  currentCfi: string;
  progress: number;
  chapterIndex: number;
  chapterTitle: string;
  chapterHref?: string; // Current chapter href for TOC matching
  isLoading: boolean;
  searchQuery: string;
  searchResults: string[];
  selectedText: string;
  selectionCfi: string | null;
  navigationHistory: NavigationHistoryItem[];
}

export interface ReaderState {
  tabs: Record<string, ReaderTab>; // keyed by tab id
  tocItems: TOCItem[];
  goToChapterFn: ((index: number) => void) | null;
  goToCfiFn: ((cfi: string) => void) | null;

  // Actions
  initTab: (tabId: string, bookId: string) => void;
  removeTab: (tabId: string) => void;
  setProgress: (tabId: string, progress: number, cfi: string) => void;
  setChapter: (tabId: string, index: number, title: string, href?: string) => void;
  setSelectedText: (tabId: string, text: string, cfi: string | null) => void;
  setSearchQuery: (tabId: string, query: string) => void;
  setSearchResults: (tabId: string, results: string[]) => void;
  setTocItems: (items: TOCItem[]) => void;
  setGoToChapterFn: (fn: ((index: number) => void) | null) => void;
  setGoToCfiFn: (fn: ((cfi: string) => void) | null) => void;
  pushHistory: (tabId: string, item: Omit<NavigationHistoryItem, "timestamp">) => void;
  goBack: (tabId: string) => void;
  canGoBack: (tabId: string) => boolean;
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  tabs: {},
  tocItems: [],
  goToChapterFn: null,
  goToCfiFn: null,

  initTab: (tabId, bookId) =>
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: {
          bookId,
          currentCfi: "",
          progress: 0,
          chapterIndex: 0,
          chapterTitle: "",
          isLoading: true,
          searchQuery: "",
          searchResults: [],
          selectedText: "",
          selectionCfi: null,
          navigationHistory: [],
        },
      },
    })),

  removeTab: (tabId) =>
    set((state) => {
      const { [tabId]: _, ...rest } = state.tabs;
      void _;
      return { tabs: rest };
    }),

  setProgress: (tabId, progress, cfi) =>
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: state.tabs[tabId]
          ? { ...state.tabs[tabId], progress, currentCfi: cfi }
          : state.tabs[tabId],
      },
    })),

  setChapter: (tabId, index, title, href) =>
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: state.tabs[tabId]
          ? { ...state.tabs[tabId], chapterIndex: index, chapterTitle: title, chapterHref: href }
          : state.tabs[tabId],
      },
    })),

  setSelectedText: (tabId, text, cfi) =>
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: state.tabs[tabId]
          ? { ...state.tabs[tabId], selectedText: text, selectionCfi: cfi }
          : state.tabs[tabId],
      },
    })),

  setSearchQuery: (tabId, query) =>
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: state.tabs[tabId]
          ? { ...state.tabs[tabId], searchQuery: query }
          : state.tabs[tabId],
      },
    })),

  setSearchResults: (tabId, results) =>
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: state.tabs[tabId]
          ? { ...state.tabs[tabId], searchResults: results }
          : state.tabs[tabId],
      },
    })),

  setTocItems: (items) => set({ tocItems: items }),

  setGoToChapterFn: (fn) => set({ goToChapterFn: fn }),

  setGoToCfiFn: (fn) => set({ goToCfiFn: fn }),

  pushHistory: (tabId, item) =>
    set((state) => {
      const tab = state.tabs[tabId];
      if (!tab) return state;

      const lastItem = tab.navigationHistory[tab.navigationHistory.length - 1];
      if (lastItem && lastItem.cfi === item.cfi) {
        return state;
      }

      return {
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...tab,
            navigationHistory: [...tab.navigationHistory, { ...item, timestamp: Date.now() }],
          },
        },
      };
    }),

  goBack: (tabId) => {
    const state = get();
    const tab = state.tabs[tabId];
    if (!tab || tab.navigationHistory.length === 0) return;

    const history = [...tab.navigationHistory];
    const previousItem = history.pop();

    if (previousItem && state.goToCfiFn) {
      set((state) => ({
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...state.tabs[tabId],
            navigationHistory: history,
          },
        },
      }));

      state.goToCfiFn(previousItem.cfi);
    }
  },

  canGoBack: (tabId) => {
    const state = get();
    const tab = state.tabs[tabId];
    return tab ? tab.navigationHistory.length > 0 : false;
  },
}));
