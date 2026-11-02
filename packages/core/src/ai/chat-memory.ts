import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { updateThreadMemory } from "../db/database";
import type { AIConfig, Message, Thread } from "../types";
import { createChatModel } from "./llm-provider";

const MIN_COMPRESSIBLE_MESSAGES = 4;
const MAX_SOURCE_CHARS = 12000;
const MAX_SUMMARY_CHARS = 2400;

function messageToLine(message: Message): string {
  const role =
    message.role === "assistant" ? "Assistant" : message.role === "user" ? "User" : "System";
  const content = (message.content || "").replace(/\s+/g, " ").trim().slice(0, 1600);
  return `${role}: ${content}`;
}

function buildSource(previousSummary: string | undefined, messages: Message[]): string {
  const parts: string[] = [];
  if (previousSummary?.trim()) {
    parts.push(`Existing memory:\n${previousSummary.trim()}`);
  }
  parts.push(`New older conversation:\n${messages.map(messageToLine).join("\n")}`);
  return parts.join("\n\n").slice(0, MAX_SOURCE_CHARS);
}

export function getCompressibleMessages(thread: Thread, slidingWindowSize: number): Message[] {
  const safeWindow = Math.max(2, slidingWindowSize || 8);
  const alreadySummarized = thread.memoryMessageCount || 0;
  const keepFrom = Math.max(0, thread.messages.length - safeWindow);
  if (keepFrom <= alreadySummarized) return [];
  return thread.messages
    .slice(alreadySummarized, keepFrom)
    .filter((message) => message.role === "user" || message.role === "assistant");
}

export async function maybeCompressThreadMemory(
  thread: Thread,
  aiConfig: AIConfig,
): Promise<Thread> {
  const slidingWindowSize = aiConfig.slidingWindowSize || 8;
  const compressible = getCompressibleMessages(thread, slidingWindowSize);
  if (compressible.length < MIN_COMPRESSIBLE_MESSAGES) return thread;

  try {
    const model = await createChatModel(aiConfig, {
      temperature: 0.2,
      maxTokens: 700,
      streaming: false,
    });

    const source = buildSource(thread.memorySummary, compressible);
    const response = await model.invoke([
      new SystemMessage(
        [
          "You compress chat history for a reading assistant.",
          "Produce durable memory only: user preferences, decisions, book-specific facts already established, unresolved tasks, and useful context for future replies.",
          "Do not include filler conversation. Keep it concise, neutral, and in the user's language when clear.",
        ].join("\n"),
      ),
      new HumanMessage(source),
    ]);

    const content =
      typeof response.content === "string"
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
              .join("\n")
          : "";
    const summary = content.trim().slice(0, MAX_SUMMARY_CHARS);
    if (!summary) return thread;

    const memoryMessageCount = (thread.memoryMessageCount || 0) + compressible.length;
    await updateThreadMemory(thread.id, summary, memoryMessageCount);
    return {
      ...thread,
      memorySummary: summary,
      memoryUpdatedAt: Date.now(),
      memoryMessageCount,
    };
  } catch (error) {
    console.warn("[chat-memory] Failed to compress thread memory:", error);
    return thread;
  }
}
