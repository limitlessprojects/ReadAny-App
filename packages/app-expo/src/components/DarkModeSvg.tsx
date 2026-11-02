import { useTheme } from "@/styles/theme";
import { type ReactElement, cloneElement } from "react";
import { StyleSheet, View } from "react-native";

interface DarkModeSvgProps {
  children: ReactElement;
  width?: number;
  height?: number;
  style?: any;
}

/**
 * DarkModeSvg - Wraps SVG illustrations with proper dark mode support.
 *
 * SVGs using fill="currentColor" will automatically adapt to the theme
 * by receiving the appropriate color prop.
 */
export function DarkModeSvg({ children, width = 140, height = 140, style }: DarkModeSvgProps) {
  const { isDark } = useTheme();

  // Pass color for currentColor paths in the SVG
  // Light mode: dark color (#1e293b)
  // Dark mode: white (#ffffff)
  const fillColor = isDark ? "#ffffff" : "#1e293b";

  const styledChild = cloneElement(children, {
    width,
    height,
    color: fillColor,
    fill: fillColor,
  } as any);

  return <View style={[{ width, height }, styles.container, style]}>{styledChild}</View>;
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
});
