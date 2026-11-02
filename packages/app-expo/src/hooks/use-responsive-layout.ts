import { useWindowDimensions } from "react-native";

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const shortestSide = Math.min(width, height);
  const longestSide = Math.max(width, height);

  const isLandscape = width > height;
  const isTablet = shortestSide >= 768 || (shortestSide >= 600 && longestSide >= 960);
  const isTabletLandscape = isTablet && isLandscape;
  const isLargeTablet = isTablet && longestSide >= 1280;

  const horizontalPadding = isTabletLandscape ? 28 : isTablet ? 24 : 16;
  const contentMaxWidth = isTabletLandscape ? 1260 : isTablet ? 980 : width;
  const centeredContentWidth = Math.min(width - horizontalPadding * 2, contentMaxWidth);

  return {
    width,
    height,
    shortestSide,
    longestSide,
    isLandscape,
    isTablet,
    isTabletLandscape,
    isLargeTablet,
    horizontalPadding,
    contentMaxWidth,
    centeredContentWidth,
  };
}
