import { describe, expect, it } from "vitest";
import type { Message, Thread } from "../../types";
import { getCompressibleMessages } from "../chat-memory";

function message(id: number): Message {
  return {
    id: `msg-${id}`,
    threadId: "thread-1",
    role: id % 2 === 0 ? "assistant" : "user",
    content: `message ${id}`,
    createdAt: id,
  };
}

function thread(messages: Message[], memoryMessageCount = 0): Thread {
  return {
    id: "thread-1",
    title: "Thread",
    messages,
    memoryMessageCount,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("chat memory compression window", () => {
  it("returns only messages outside the sliding window", () => {
    const messages = Array.from({ length: 10 }, (_, index) => message(index + 1));

    const compressible = getCompressibleMessages(thread(messages), 4);

    expect(compressible.map((item) => item.id)).toEqual([
      "msg-1",
      "msg-2",
      "msg-3",
      "msg-4",
      "msg-5",
      "msg-6",
    ]);
  });

  it("does not return messages that were already summarized", () => {
    const messages = Array.from({ length: 10 }, (_, index) => message(index + 1));

    const compressible = getCompressibleMessages(thread(messages, 4), 4);

    expect(compressible.map((item) => item.id)).toEqual(["msg-5", "msg-6"]);
  });
});
