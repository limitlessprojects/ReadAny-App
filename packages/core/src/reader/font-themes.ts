/**
 * Font theme presets for reading
 */
import type { FontTheme } from "../types";

export const FONT_THEMES: FontTheme[] = [
  {
    id: "system",
    name: "系统默认",
    nameEn: "System Default",
    serif: "system-ui",
    sansSerif: "system-ui",
    cjk: "system-ui",
  },
  {
    id: "literata",
    name: "文学书卷",
    nameEn: "Literata",
    serif: "Literata, Georgia, serif",
    sansSerif: "Literata, Georgia, serif",
    cjk: "'Noto Serif SC', 'Source Han Serif SC', serif",
  },
];

export const DEFAULT_FONT_THEME = "system";

export function getFontTheme(id: string): FontTheme {
  return FONT_THEMES.find((theme) => theme.id === id) || FONT_THEMES[0];
}
