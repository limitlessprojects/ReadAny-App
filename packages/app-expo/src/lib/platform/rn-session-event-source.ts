import type { SessionEventSource } from "@readany/core/hooks/use-reading-session";
import { AppState, type AppStateStatus } from "react-native";

/**
 * React Native implementation of SessionEventSource for reading stats tracking.
 * - Activity is primarily managed by the hook triggering on user interactions.
 * - Visibility is tracked using AppState changes.
 * - Before Unload is simulated on unmount or blur.
 */
export const rnSessionEventSource: SessionEventSource = {
  subscribeActivity(callback) {
    // React Native doesn't have a global "any interaction" listener like window.mousemove.
    // However, the WebView or Scrollview can manually send `{ type: "activity" }` to the hook.
    // For now this is a no-op, ReaderScreen explicitly triggers activity.
    return () => {};
  },

  subscribeVisibility(callback) {
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      // visible when "active", hidden when "background" or "inactive"
      callback(nextAppState === "active");
    });
    return () => subscription.remove();
  },

  subscribeBeforeUnload(callback) {
    // In React Native, this concept doesn't exist globally in the same way.
    // The closest is AppState backgrounding, which is handled by visibility,
    // or unmounting ReaderScreen, which is handled manually in the screen cleanup.
    return () => {};
  },
};
