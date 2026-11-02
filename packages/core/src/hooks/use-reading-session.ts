import { useCallback, useEffect, useRef } from "react";
/**
 * useReadingSession — reading session state machine hook
 *
 * Cross-platform: event listeners are provided by a SessionEventSource adapter.
 * - Web: uses window/document event listeners (default)
 * - React Native: inject an AppState-based adapter
 */
import { type SessionEvent, createSessionDetector } from "../reader/session-detector";
import { useAppStore } from "../stores/app-store";
import { useReadingSessionStore } from "../stores/reading-session-store";
import { useSyncStore } from "../stores/sync-store";

// Save session every 5 minutes
const AUTO_SAVE_INTERVAL = 5 * 60 * 1000;

/**
 * Platform adapter for user activity / visibility / unload events.
 * Each platform provides its own implementation.
 */
export interface SessionEventSource {
  /** Subscribe to user activity events. Returns unsubscribe function. */
  subscribeActivity(callback: () => void): () => void;
  /** Subscribe to visibility changes. Returns unsubscribe function. */
  subscribeVisibility(callback: (visible: boolean) => void): () => void;
  /** Subscribe to app close / beforeunload. Returns unsubscribe function. */
  subscribeBeforeUnload(callback: () => void): () => void;
}

/** Default Web implementation using window/document events */
export const webSessionEventSource: SessionEventSource = {
  subscribeActivity(callback) {
    if (typeof window === "undefined") return () => {};
    const events = ["mousemove", "keydown", "scroll", "click", "touchstart"] as const;
    for (const evt of events) {
      window.addEventListener(evt, callback);
    }
    return () => {
      for (const evt of events) {
        window.removeEventListener(evt, callback);
      }
    };
  },
  subscribeVisibility(callback) {
    if (typeof document === "undefined") return () => {};
    const handler = () => callback(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  },
  subscribeBeforeUnload(callback) {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("beforeunload", callback);
    return () => window.removeEventListener("beforeunload", callback);
  },
};

/** Global override — set by platforms that cannot use web events (e.g. React Native) */
let _sessionEventSource: SessionEventSource = webSessionEventSource;

export function setSessionEventSource(source: SessionEventSource): void {
  _sessionEventSource = source;
}

export function useReadingSession(bookId: string | null, tabId?: string) {
  const {
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    updateActiveTime,
    saveCurrentSession,
  } = useReadingSessionStore();
  const activeTabId = useAppStore((s) => s.activeTabId);
  const isTabActive = tabId ? activeTabId === tabId : true;

  const detectorRef = useRef(
    createSessionDetector(undefined, (_from, to) => {
      switch (to) {
        case "ACTIVE":
          if (_from === "STOPPED") startSession(bookId ?? "");
          else resumeSession();
          break;
        case "PAUSED":
          pauseSession();
          break;
        case "STOPPED":
          stopSession();
          break;
      }
    }),
  );

  const lastActivityRef = useRef(Date.now());
  const lastSaveRef = useRef(Date.now());

  const sendEvent = useCallback((event: SessionEvent) => {
    if (event.type === "activity") {
      lastActivityRef.current = Date.now();
    }
    detectorRef.current.processEvent(event);
  }, []);

  const wasActiveRef = useRef(isTabActive);
  useEffect(() => {
    if (wasActiveRef.current && !isTabActive) {
      saveCurrentSession();
      sendEvent({ type: "visibility", visible: false });
    } else if (!wasActiveRef.current && isTabActive) {
      sendEvent({ type: "activity" });
    }
    wasActiveRef.current = isTabActive;
  }, [isTabActive, saveCurrentSession, sendEvent]);

  useEffect(() => {
    if (!bookId) return;

    const source = _sessionEventSource;

    const onActivity = () => {
      if (useAppStore.getState().activeTabId === tabId || !tabId) {
        sendEvent({ type: "activity" });
      }
    };

    const unsubActivity = source.subscribeActivity(onActivity);
    const unsubVisibility = source.subscribeVisibility((visible) =>
      sendEvent({ type: "visibility", visible }),
    );
    const unsubUnload = source.subscribeBeforeUnload(() => stopSession());

    sendEvent({ type: "activity" });

    const timer = setInterval(() => {
      const currentTabId = useAppStore.getState().activeTabId;
      const isCurrentTabActive = tabId ? currentTabId === tabId : true;
      const currentState = detectorRef.current.currentState;

      const idleDuration = Date.now() - lastActivityRef.current;
      if (idleDuration >= 30000) {
        sendEvent({ type: "idle", duration: idleDuration });
      }

      if (currentState === "ACTIVE" && isCurrentTabActive) {
        updateActiveTime();

        const syncStatus = useSyncStore.getState().status;
        const syncInProgress = syncStatus !== "idle" && syncStatus !== "error";
        if (!syncInProgress && Date.now() - lastSaveRef.current >= AUTO_SAVE_INTERVAL) {
          lastSaveRef.current = Date.now();
          saveCurrentSession();
        }
      }
    }, 1000);

    return () => {
      unsubActivity();
      unsubVisibility();
      unsubUnload();
      clearInterval(timer);
      sendEvent({ type: "close" });
    };
  }, [bookId, tabId, sendEvent, updateActiveTime, stopSession, saveCurrentSession]);

  return { sendEvent };
}
