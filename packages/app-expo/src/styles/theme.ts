/**
 * Theme constants — re-exports dark colors as default for backward compat.
 * Use `useTheme()` from ThemeContext for reactive theme colors.
 */
import { darkColors, useTheme } from "./ThemeContext";
export type { ThemeColors } from "./ThemeContext";
export { useTheme } from "./ThemeContext";

/**
 * Convert a hex color to an rgba string with the given opacity.
 * Accepts 3-digit (#abc) or 6-digit (#aabbcc) hex values.
 */
export function withOpacity(hex: string, opacity: number): string {
  let r: number, g: number, b: number;
  const h = hex.replace("#", "");
  if (h.length === 3) {
    r = Number.parseInt(h[0] + h[0], 16);
    g = Number.parseInt(h[1] + h[1], 16);
    b = Number.parseInt(h[2] + h[2], 16);
  } else {
    r = Number.parseInt(h.slice(0, 2), 16);
    g = Number.parseInt(h.slice(2, 4), 16);
    b = Number.parseInt(h.slice(4, 6), 16);
  }
  return `rgba(${r},${g},${b},${opacity})`;
}

/** @deprecated Use useColors() instead for theme-aware components */
export const colors = darkColors;

/**
 * Hook to get current theme colors. Use this in component function bodies
 * so the local `colors` variable shadows the static import, making
 * StyleSheet.create fallback to dark while inline styles use the real theme.
 */
export function useColors() {
  return useTheme().colors;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 16,
  full: 9999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  md: 18,
  lg: 20,
  xl: 22,
  "2xl": 26,
  "3xl": 30,
} as const;

export const fontWeight = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};
