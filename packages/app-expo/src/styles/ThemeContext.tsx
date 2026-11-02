import * as SecureStore from "expo-secure-store";
/**
 * ThemeContext — provides light / dark / sepia theme support matching Tauri mobile.
 *
 * oklch values from globals.css are converted to hex.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "sepia" | "oled";

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  primary: string;
  primaryForeground: string;
  destructive: string;
  destructiveForeground: string;
  accent: string;
  accentForeground: string;
  // Functional
  indigo: string;
  emerald: string;
  amber: string;
  blue: string;
  violet: string;
  // Highlight colors
  highlightYellow: string;
  highlightGreen: string;
  highlightBlue: string;
  highlightPink: string;
  highlightPurple: string;
  // Fallback cover gradients
  stone100: string;
  stone200: string;
  stone300: string;
  stone400: string;
  stone500: string;
}

// ── Light theme (from :root in globals.css) ──
const lightColors: ThemeColors = {
  background: "#faf9f5",
  foreground: "#1c1c1e",
  card: "#ffffff",
  cardForeground: "#1c1c1e",
  muted: "#f2f1ed",
  mutedForeground: "#7c7c82",
  border: "#e5e5e5",
  primary: "#2d2d30",
  primaryForeground: "#fafafa",
  destructive: "#e53935",
  destructiveForeground: "#fafafa",
  accent: "#f5f5f5",
  accentForeground: "#2d2d30",
  indigo: "#6366f1",
  emerald: "#10b981",
  amber: "#f59e0b",
  blue: "#3b82f6",
  violet: "#7c3aed",
  highlightYellow: "#fef08a",
  highlightGreen: "#bbf7d0",
  highlightBlue: "#bfdbfe",
  highlightPink: "#fbcfe8",
  highlightPurple: "#e9d5ff",
  stone100: "#f5f5f4",
  stone200: "#e7e5e4",
  stone300: "#d6d3d1",
  stone400: "#a8a29e",
  stone500: "#78716c",
};

// ── Dark theme (from .dark in globals.css) ──
const darkColors: ThemeColors = {
  background: "#1c1c1e",
  foreground: "#e8e8ed",
  card: "#2c2c2e",
  cardForeground: "#e8e8ed",
  muted: "#333336",
  mutedForeground: "#7c7c82",
  border: "#3d3d40",
  primary: "#e0e0e6",
  primaryForeground: "#1c1c1e",
  destructive: "#e53935",
  destructiveForeground: "#ffffff",
  accent: "#363638",
  accentForeground: "#e0e0e6",
  indigo: "#6366f1",
  emerald: "#10b981",
  amber: "#f59e0b",
  blue: "#3b82f6",
  violet: "#a78bfa",
  highlightYellow: "#854d0e",
  highlightGreen: "#166534",
  highlightBlue: "#1e40af",
  highlightPink: "#9d174d",
  highlightPurple: "#6b21a8",
  stone100: "#f5f5f4",
  stone200: "#e7e5e4",
  stone300: "#d6d3d1",
  stone400: "#a8a29e",
  stone500: "#78716c",
};

// OLED theme — true-black canvas with the existing dark elevated surfaces.
const oledColors: ThemeColors = {
  ...darkColors,
  background: "#000000",
};

// ── Sepia theme (from [data-theme="sepia"] in globals.css) ──
const sepiaColors: ThemeColors = {
  background: "#f0e6d2",
  foreground: "#3d2b1f",
  card: "#f5ebd7",
  cardForeground: "#3d2b1f",
  muted: "#e6d9c3",
  mutedForeground: "#7a6652",
  border: "#d4c4a8",
  primary: "#6b4c2a",
  primaryForeground: "#f5ebd7",
  destructive: "#e53935",
  destructiveForeground: "#fafafa",
  accent: "#e6d9c3",
  accentForeground: "#4a3728",
  indigo: "#6366f1",
  emerald: "#10b981",
  amber: "#f59e0b",
  blue: "#3b82f6",
  violet: "#7c3aed",
  highlightYellow: "#fef08a",
  highlightGreen: "#bbf7d0",
  highlightBlue: "#bfdbfe",
  highlightPink: "#fbcfe8",
  highlightPurple: "#e9d5ff",
  stone100: "#f5f5f4",
  stone200: "#e7e5e4",
  stone300: "#d6d3d1",
  stone400: "#a8a29e",
  stone500: "#78716c",
};

const THEME_MAP: Record<ThemeMode, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
  sepia: sepiaColors,
  oled: oledColors,
};

const STORAGE_KEY = "readany-theme";

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "sepia",
  colors: sepiaColors,
  setMode: () => {},
  isDark: false,
});

export function ThemeProvider({
  children,
  initialMode = "sepia",
}: {
  children: ReactNode;
  initialMode?: ThemeMode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "sepia" || saved === "oled") {
        setModeState(saved);
      }
    });
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    SecureStore.setItemAsync(STORAGE_KEY, m);
  }, []);

  const value: ThemeContextValue = {
    mode,
    colors: THEME_MAP[mode],
    setMode,
    isDark: mode === "dark" || mode === "oled",
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Helper: get the initial theme synchronously for static styles.
 * Components that need reactive theme should use useTheme() instead.
 */
export { lightColors, darkColors, sepiaColors, oledColors, THEME_MAP };
