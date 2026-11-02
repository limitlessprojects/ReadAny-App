/**
 * Hooks for React Native
 */

// Use core streaming chat with tool support (LangGraph agent)
export { useStreamingChat } from "@readany/core/hooks/use-streaming-chat";
export type { StreamingChatOptions, StreamingState } from "@readany/core/hooks/use-streaming-chat";

export interface SessionEventSource {
  emit: (event: string, data: unknown) => void;
}

export { rnSessionEventSource } from "@/lib/platform/rn-session-event-source";

export { useDebounce } from "./use-debounce";
export { useThrottledValue, useThrottledCallback } from "./use-throttled-value";
