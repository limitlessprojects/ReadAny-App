import { create } from "zustand";

interface DownloadProgress {
  downloaded: number;
  total: number;
}

interface DownloadProgressState {
  progress: Record<string, DownloadProgress>;
  setProgress: (bookId: string, downloaded: number, total: number) => void;
  clearProgress: (bookId: string) => void;
}

export const useDownloadProgressStore = create<DownloadProgressState>((set) => ({
  progress: {},
  setProgress: (bookId, downloaded, total) =>
    set((state) => ({
      progress: { ...state.progress, [bookId]: { downloaded, total } },
    })),
  clearProgress: (bookId) =>
    set((state) => {
      if (!(bookId in state.progress)) return state;
      const next = { ...state.progress };
      delete next[bookId];
      return { progress: next };
    }),
}));
