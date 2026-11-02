import type { SessionEventSource } from "@readany/core/hooks";
/**
 * React Native SessionEventSource — uses AppState for visibility
 * and PanResponder touch events for activity detection.
 */
import { AppState } from "react-native";

export const rnSessionEventSource: SessionEventSource = {
  subscribeActivity(callback) {
    // In RN, activity detection happens at the component level (touch/scroll).
    // We provide a noop here — the reading session hook's timer handles idle detection.
    // Components can call sendEvent({ type: "activity" }) on gestures.
    const noop = () => {};
    return noop;
  },

  subscribeVisibility(callback) {
    const subscription = AppState.addEventListener("change", (state) => {
      callback(state === "active");
    });
    return () => subscription.remove();
  },

  subscribeBeforeUnload(callback) {
    // RN has no "beforeunload". We save on visibility change (background) instead.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        callback();
      }
    });
    return () => subscription.remove();
  },
};
