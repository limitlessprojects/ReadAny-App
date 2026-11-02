import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
/**
 * SearchBar — in-book search
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  resultCount: number;
  currentIndex: number;
}

export function SearchBar({
  onSearch,
  onNext,
  onPrev,
  onClose,
  resultCount,
  currentIndex,
}: SearchBarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearch(value);
      }, 300);
    },
    [onSearch],
  );

  return (
    <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2">
      <Search className="h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={t("reader.searchInBook")}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        className="h-7 flex-1"
        autoFocus
      />
      {resultCount > 0 && (
        <span className="text-xs text-muted-foreground">
          {currentIndex + 1} / {resultCount}
        </span>
      )}
      <button onClick={onPrev} className="p-1 hover:bg-muted rounded">
        <ChevronUp className="h-4 w-4" />
      </button>
      <button onClick={onNext} className="p-1 hover:bg-muted rounded">
        <ChevronDown className="h-4 w-4" />
      </button>
      <button onClick={onClose} className="p-1 hover:bg-muted rounded">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
