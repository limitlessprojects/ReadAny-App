/**
 * useReaderSearch — handles in-book search state, debouncing, and navigation.
 */
import { useCallback, useRef, useState } from "react";

export interface ReaderSearchBridge {
  search?: (query: string) => void;
  clearSearch?: () => void;
  navigateSearch?: (index: number) => void;
  goToCFI?: (cfi: string) => void;
}

export interface UseReaderSearchOptions {
  currentCfi: string;
  bridge: ReaderSearchBridge;
}

export interface UseReaderSearchResult {
  searchQuery: string;
  searchResultCount: number;
  searchIndex: number;
  isSearching: boolean;
  searchStartCfi: string | null;
  setSearchStartCfi: (cfi: string | null) => void;
  handleSearchInput: (query: string) => void;
  navigateSearch: (direction: "prev" | "next") => void;
  clearSearch: () => void;
  onSearchResult: (index: number, count: number) => void;
  onSearchComplete: (count: number) => void;
}

export function useReaderSearch({
  currentCfi,
  bridge,
}: UseReaderSearchOptions): UseReaderSearchResult {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResultCount, setSearchResultCount] = useState(0);
  const [searchIndex, setSearchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStartCfi, setSearchStartCfi] = useState<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchInput = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        const trimmed = query.trim();
        if (trimmed) {
          if (!searchStartCfi && currentCfi) {
            setSearchStartCfi(currentCfi);
          }
          setIsSearching(true);
          bridge.search?.(trimmed);
        } else {
          setSearchResultCount(0);
          setSearchIndex(0);
          bridge.clearSearch?.();
        }
      }, 300);
    },
    [bridge, searchStartCfi, currentCfi],
  );

  const navigateSearch = useCallback(
    (direction: "prev" | "next") => {
      if (searchResultCount === 0) return;
      const newIdx =
        direction === "next"
          ? (searchIndex + 1) % searchResultCount
          : (searchIndex - 1 + searchResultCount) % searchResultCount;
      setSearchIndex(newIdx);
      bridge.navigateSearch?.(newIdx);
    },
    [searchIndex, searchResultCount, bridge],
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResultCount(0);
    setSearchIndex(0);
    setIsSearching(false);
    bridge.clearSearch?.();
  }, [bridge]);

  // Bridge callbacks for onSearchResult / onSearchComplete
  const onSearchResult = useCallback((index: number, count: number) => {
    setSearchIndex(index);
    setSearchResultCount(count);
  }, []);

  const onSearchComplete = useCallback((count: number) => {
    setSearchResultCount(count);
    setIsSearching(false);
  }, []);

  return {
    searchQuery,
    searchResultCount,
    searchIndex,
    isSearching,
    searchStartCfi,
    setSearchStartCfi,
    handleSearchInput,
    navigateSearch,
    clearSearch,
    onSearchResult,
    onSearchComplete,
  };
}
