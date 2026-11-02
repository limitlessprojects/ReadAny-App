/**
 * ChatInput — sageread-style rounded card input with deep thinking option
 * Supports attached context quotes that display as chips above the textarea.
 * Includes guarded mic dictation (Web Speech API) where the browser supports it.
 */
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AttachedQuote } from "@readany/core/types";
import { AlertCircle, Brain, EyeOff, Mic, Quote, Send, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
export type { AttachedQuote };

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

/** Chrome/Edge expose SpeechRecognition; Firefox/Safari may not. */
function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

/** Map Web Speech API error codes to a user-facing hint key. */
function dictationErrorKey(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "chat.dictationErrorPermission";
    case "network":
      return "chat.dictationErrorNetwork";
    case "no-speech":
      return "chat.dictationErrorNoSpeech";
    case "audio-capture":
      return "chat.dictationErrorMic";
    default:
      return "chat.dictationErrorGeneric";
  }
}

interface ChatInputProps {
  onSend: (
    content: string,
    deepThinking?: boolean,
    spoilerFree?: boolean,
    quotes?: AttachedQuote[],
  ) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  showDeepThinking?: boolean;
  quotes?: AttachedQuote[];
  onRemoveQuote?: (id: string) => void;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  placeholder,
  showDeepThinking = true,
  quotes = [],
  onRemoveQuote,
}: ChatInputProps) {
  const { t, i18n } = useTranslation();
  const [value, setValue] = useState("");
  const [deepThinking, setDeepThinking] = useState(false);
  const [spoilerFree, setSpoilerFree] = useState(false);
  const [listening, setListening] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speechSupported = useMemo(() => !!getSpeechRecognitionCtor(), []);

  const showDictationError = useCallback((message: string) => {
    setDictationError(message);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setDictationError(null), 5000);
  }, []);

  // Stop dictation when the input unmounts (tab switch etc.)
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const toggleDictation = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    setDictationError(null);
    // Abort any previous handle before starting a fresh one.
    recognitionRef.current?.abort();
    const recognition = new Ctor();
    const baseLang = (i18n.language || navigator.language || "en-US").split("-")[0];
    recognition.lang =
      baseLang === "sw" ? "sw-KE" : i18n.language && i18n.language !== "en" ? i18n.language : "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i]?.[0]?.transcript ?? "";
      }
      setValue(transcript);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
        }
      });
    };
    recognition.onerror = (event) => {
      const code =
        typeof event === "object" && event !== null && "error" in event
          ? String((event as { error?: unknown }).error ?? "unknown")
          : "unknown";
      // no-speech is a soft miss — the mic button stays usable; surface it
      // instead of failing silently (the "too quiet" bug class).
      showDictationError(t(dictationErrorKey(code), "Dictation problem — try again"));
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      recognitionRef.current = null;
      showDictationError(t("chat.dictationErrorGeneric", "Dictation problem — try again"));
    }
  }, [listening, i18n.language, showDictationError, t]);

  const resolvedPlaceholder = placeholder || t("chat.askPlaceholder");

  const handleSend = useCallback(
    (useDeepThinking: boolean = deepThinking) => {
      const trimmed = value.trim();
      if (trimmed || quotes.length > 0) {
        onSend(trimmed, useDeepThinking, spoilerFree, quotes.length > 0 ? quotes : undefined);
        setValue("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      }
    },
    [value, deepThinking, spoilerFree, onSend, quotes],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, []);

  const toggleDeepThinking = useCallback(() => {
    setDeepThinking((prev) => !prev);
  }, []);

  const toggleSpoilerFree = useCallback(() => {
    setSpoilerFree((prev) => !prev);
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="relative rounded-2xl border bg-background shadow-around">
        {/* Attached quotes chips */}
        {quotes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            <TooltipProvider delayDuration={300}>
              {quotes.map((q) => (
                <Tooltip key={q.id}>
                  <TooltipTrigger asChild>
                    <span className="group inline-flex max-w-[200px] items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary">
                      <Quote className="size-3 shrink-0 opacity-60" />
                      <span className="truncate">{q.text}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveQuote?.(q.id);
                        }}
                        className="ml-0.5 shrink-0 rounded-full p-0.5 opacity-0 transition-opacity hover:bg-primary/10 group-hover:opacity-100"
                      >
                        <X className="size-2.5" />
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-xs whitespace-pre-wrap bg-popover text-popover-foreground border shadow-md"
                  >
                    <p className="text-xs leading-relaxed">
                      {q.text.length > 300 ? `${q.text.slice(0, 300)}...` : q.text}
                    </p>
                    {q.source && (
                      <p className="mt-1 text-[10px] text-muted-foreground">— {q.source}</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder={quotes.length > 0 ? t("chat.askAboutQuote") : resolvedPlaceholder}
          disabled={disabled}
          rows={1}
          className="w-full resize-none bg-transparent px-4 pb-1 pt-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          style={{ minHeight: 36, maxHeight: 160 }}
        />
        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-1">
            {showDeepThinking && (
              <button
                type="button"
                onClick={toggleDeepThinking}
                className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors ${
                  deepThinking
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Brain className="size-3" />
                <span>{t("chat.deepThinking")}</span>
              </button>
            )}
            {showDeepThinking && (
              <button
                type="button"
                onClick={toggleSpoilerFree}
                className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors ${
                  spoilerFree
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <EyeOff className="size-3" />
                <span>{t("chat.spoilerFree")}</span>
              </button>
            )}
            {speechSupported && (
              <button
                type="button"
                onClick={toggleDictation}
                title={listening ? t("chat.dictationStop", "Stop dictation") : t("chat.dictation", "Voice input")}
                className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors ${
                  listening
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Mic className={`size-3 ${listening ? "animate-pulse" : ""}`} />
                <span>{listening ? t("chat.dictationActive", "Listening…") : t("chat.dictation", "Voice")}</span>
              </button>
            )}
          </div>
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="flex size-7 items-center justify-center rounded-full border border-destructive/20 bg-destructive text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90"
            >
              <Square className="size-3" />
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled || (!value.trim() && quotes.length === 0)}
              onClick={() => handleSend()}
              className={`flex size-7 items-center justify-center rounded-full transition-colors ${
                value.trim() || quotes.length > 0
                  ? "border border-primary/20 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  : "border border-border bg-background text-muted-foreground hover:bg-muted"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Send className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {deepThinking && (
        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          {t("chat.deepThinkingHint")}
        </p>
      )}
      {spoilerFree && (
        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          {t("chat.spoilerFreeHint")}
        </p>
      )}
      {dictationError && (
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-center text-xs text-destructive">
          <AlertCircle className="size-3 shrink-0" />
          <span>{dictationError}</span>
        </p>
      )}
    </div>
  );
}
