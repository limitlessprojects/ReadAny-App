/**
 * useThrottledValue hook
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useThrottledValue<T>(value: T, interval: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdated = useRef<number>(Date.now());

  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdated.current >= interval) {
      lastUpdated.current = now;
      setThrottledValue(value);
    } else {
      const timer = setTimeout(
        () => {
          lastUpdated.current = Date.now();
          setThrottledValue(value);
        },
        interval - (now - lastUpdated.current),
      );

      return () => clearTimeout(timer);
    }
  }, [value, interval]);

  return throttledValue;
}

export function useThrottledCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  interval: number,
): T {
  const lastCalled = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const throttledCallback = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCalled.current >= interval) {
        lastCalled.current = now;
        callback(...args);
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(
          () => {
            lastCalled.current = Date.now();
            callback(...args);
          },
          interval - (now - lastCalled.current),
        );
      }
    },
    [callback, interval],
  ) as T;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttledCallback;
}

export function useStreamingText(initialText = ""): {
  text: string;
  append: (chunk: string) => void;
  reset: () => void;
} {
  const [text, setText] = useState(initialText);

  const append = useCallback((chunk: string) => {
    setText((prev) => prev + chunk);
  }, []);

  const reset = useCallback(() => {
    setText("");
  }, []);

  return { text, append, reset };
}
