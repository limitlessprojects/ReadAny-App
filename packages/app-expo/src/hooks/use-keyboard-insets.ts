import { useEffect, useMemo, useState } from "react";
import { Dimensions, Keyboard, type KeyboardEvent, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type KeyboardState = {
  height: number;
  rawHeight: number;
  visible: boolean;
};

function getRawKeyboardHeight(event: KeyboardEvent | undefined) {
  const coordinates = event?.endCoordinates;
  const keyboardMetrics = Keyboard.metrics?.();
  const reportedHeight = coordinates?.height ?? 0;
  const metricsHeight = keyboardMetrics?.height ?? 0;
  const screenY = coordinates?.screenY;
  const windowOverlap =
    typeof screenY === "number" ? Math.max(0, Dimensions.get("window").height - screenY) : 0;
  const screenOverlap =
    reportedHeight === 0 && metricsHeight === 0 && typeof screenY === "number"
      ? Math.max(0, Dimensions.get("screen").height - screenY)
      : 0;
  return Math.max(reportedHeight, metricsHeight, windowOverlap, screenOverlap);
}

export function useKeyboardInsets() {
  const safeAreaInsets = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState<KeyboardState>({
    height: 0,
    rawHeight: 0,
    visible: false,
  });

  useEffect(() => {
    const showEvents =
      Platform.OS === "ios"
        ? (["keyboardWillChangeFrame", "keyboardDidChangeFrame", "keyboardDidShow"] as const)
        : (["keyboardDidShow"] as const);
    const hideEvents =
      Platform.OS === "ios"
        ? (["keyboardWillHide", "keyboardDidHide"] as const)
        : (["keyboardDidHide"] as const);

    const updateKeyboard = (event: KeyboardEvent) => {
      const rawHeight = getRawKeyboardHeight(event);
      const height = Math.max(0, rawHeight - safeAreaInsets.bottom);
      setKeyboard({ height, rawHeight, visible: rawHeight > 0 });
    };
    const hideKeyboard = () => {
      setKeyboard({ height: 0, rawHeight: 0, visible: false });
    };

    const subscriptions = [
      ...showEvents.map((eventName) => Keyboard.addListener(eventName, updateKeyboard)),
      ...hideEvents.map((eventName) => Keyboard.addListener(eventName, hideKeyboard)),
    ];

    return () => {
      for (const subscription of subscriptions) {
        subscription.remove();
      }
    };
  }, [safeAreaInsets.bottom]);

  return useMemo(
    () => ({
      bottomInset: keyboard.height,
      height: keyboard.height,
      isVisible: keyboard.visible,
      rawHeight: keyboard.rawHeight,
      safeAreaBottom: safeAreaInsets.bottom,
    }),
    [keyboard.height, keyboard.rawHeight, keyboard.visible, safeAreaInsets.bottom],
  );
}
