import { useColors } from "@/styles/theme";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";

interface BookmarkRibbonProps {
  visible: boolean;
  topOffset?: number;
}

/**
 * A bookmark ribbon shown at the top-right of the reader page
 * when the current position is bookmarked.
 */
export function BookmarkRibbon({ visible, topOffset = 0 }: BookmarkRibbonProps) {
  const colors = useColors();
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [visible, anim]);

  const opacity = anim;
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { top: topOffset, opacity, transform: [{ translateY }] }]}
    >
      <Svg width={14} height={60} viewBox="0 0 14 60">
        <Path d="M0 0h14v54l-7-4-7 4V0z" fill={colors.primary} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 20,
    top: 0,
    zIndex: 10,
  },
});
