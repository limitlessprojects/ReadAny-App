/**
 * Re-export chat store from core to ensure a single zustand store instance
 * is shared between Expo screens and core hooks (useStreamingChat).
 */
export { useChatStore } from "@readany/core/stores/chat-store";
export type { ChatState } from "@readany/core/stores/chat-store";
