/**
 * useIsNarrowViewport — SSR-safe media-query hook.
 *
 * True when the window is narrower than `maxWidth` px (default 768). Used to
 * switch desktop side-panels (AI chat, notebook) to full-screen overlay
 * sheets on phone-width viewports instead of squeezing the document into a
 * vertical sliver.
 */
import { useEffect, useState } from "react";

export function useIsNarrowViewport(maxWidth = 768): boolean {
  const query = `(max-width: ${maxWidth - 1}px)`;
  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    setIsNarrow(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return isNarrow;
}
