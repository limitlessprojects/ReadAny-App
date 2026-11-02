/**
 * useResizablePanel — manages panel width with drag-to-resize.
 *
 * Stores the width in localStorage so it persists across sessions.
 */
import { useCallback, useRef, useState } from "react";

interface UseResizablePanelOptions {
  /** localStorage key for persistence */
  storageKey: string;
  /** Default width in px */
  defaultWidth: number;
  /** Minimum width in px */
  minWidth?: number;
  /** Maximum width in px */
  maxWidth?: number;
}

export function useResizablePanel({
  storageKey,
  defaultWidth,
  minWidth = 200,
  maxWidth = 600,
}: UseResizablePanelOptions) {
  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = Number(saved);
        if (!Number.isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return defaultWidth;
  });

  const widthAtDragStartRef = useRef(width);
  const latestWidthRef = useRef(width);

  const handleResizeStart = useCallback(() => {
    widthAtDragStartRef.current = latestWidthRef.current;
  }, []);

  /**
   * @param delta — pixels moved from drag start (positive = cursor moved right)
   * @param side — which side the resize handle is on:
   *   - "right": handle on right edge of a LEFT panel → drag right = wider
   *   - "left": handle on left edge of a RIGHT panel → drag left = wider (delta negative = wider)
   */
  const handleResize = useCallback(
    (delta: number, side: "left" | "right") => {
      // For a RIGHT-side panel with handle on left: dragging left (negative delta) should increase width
      const direction = side === "right" ? 1 : -1;
      const newWidth = Math.round(
        Math.min(maxWidth, Math.max(minWidth, widthAtDragStartRef.current + delta * direction)),
      );
      latestWidthRef.current = newWidth;
      setWidth(newWidth);
    },
    [minWidth, maxWidth],
  );

  const handleResizeEnd = useCallback(() => {
    try {
      localStorage.setItem(storageKey, String(latestWidthRef.current));
    } catch {
      // ignore
    }
  }, [storageKey]);

  return { width, handleResize, handleResizeStart, handleResizeEnd };
}
