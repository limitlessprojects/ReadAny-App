import { describe, expect, it } from "vitest";
import { convertToMessageV2 } from "./chat-utils";

describe("convertToMessageV2", () => {
  it("preserves failed tool calls when reconstructing ordered parts", () => {
    const [message] = convertToMessageV2([
      {
        id: "message-1",
        threadId: "thread-1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tool-1",
            name: "fallbackToc",
            args: { bookId: "book-1" },
            result: { error: "fallbackToc is not available" },
            status: "error",
            error: "fallbackToc is not available",
          },
        ],
        partsOrder: [{ type: "tool_call", id: "tool-1" }],
        createdAt: 123,
      },
    ]);

    expect(message.parts).toEqual([
      expect.objectContaining({
        id: "tool-1",
        type: "tool_call",
        name: "fallbackToc",
        status: "error",
        error: "fallbackToc is not available",
        result: { error: "fallbackToc is not available" },
      }),
    ]);
  });

  it("preserves failed tool calls in legacy messages", () => {
    const [message] = convertToMessageV2([
      {
        id: "message-1",
        threadId: "thread-1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tool-1",
            name: "fallbackSearch",
            args: { query: "confucius" },
            status: "error",
            error: "Original file is missing",
          },
        ],
        createdAt: 123,
      },
    ]);

    expect(message.parts[0]).toEqual(
      expect.objectContaining({
        id: "tool-1",
        type: "tool_call",
        name: "fallbackSearch",
        status: "error",
        error: "Original file is missing",
      }),
    );
  });

  it("preserves citationIndex when reconstructing ordered citation parts", () => {
    const [message] = convertToMessageV2([
      {
        id: "message-1",
        threadId: "thread-1",
        role: "assistant",
        content: "第二处引用[2]在第一处引用[1]前面生成也不能错。",
        partsOrder: [
          {
            type: "citation",
            id: "citation-2",
            bookId: "book-1",
            chapterTitle: "Chapter 2",
            chapterIndex: 2,
            cfi: "epubcfi(/6/4)",
            text: "second citation",
            citationIndex: 2,
          },
          {
            type: "citation",
            id: "citation-1",
            bookId: "book-1",
            chapterTitle: "Chapter 1",
            chapterIndex: 1,
            cfi: "epubcfi(/6/2)",
            text: "first citation",
            citationIndex: 1,
          },
          { type: "text", id: "text-1", text: "第二处引用[2]在第一处引用[1]前面生成也不能错。" },
        ],
        createdAt: 123,
      },
    ]);

    expect(message.parts).toEqual([
      expect.objectContaining({ id: "citation-2", type: "citation", citationIndex: 2 }),
      expect.objectContaining({ id: "citation-1", type: "citation", citationIndex: 1 }),
      expect.objectContaining({ id: "text-1", type: "text" }),
    ]);
  });

  it("recovers citationIndex from addCitation tool results for older ordered messages", () => {
    const [message] = convertToMessageV2([
      {
        id: "message-1",
        threadId: "thread-1",
        role: "assistant",
        content: "引用[1]",
        toolCalls: [
          {
            id: "tool-1",
            name: "addCitation",
            args: {},
            status: "completed",
            result: {
              type: "citation",
              bookId: "book-1",
              chapterTitle: "Chapter 1",
              chapterIndex: 1,
              cfi: "epubcfi(/6/2)",
              text: "first citation",
              citationIndex: 1,
            },
          },
        ],
        partsOrder: [
          {
            type: "citation",
            id: "citation-1",
            bookId: "book-1",
            chapterTitle: "Chapter 1",
            chapterIndex: 1,
            cfi: "epubcfi(/6/2)",
            text: "first citation",
          },
        ],
        createdAt: 123,
      },
    ]);

    expect(message.parts[0]).toEqual(
      expect.objectContaining({
        id: "citation-1",
        type: "citation",
        citationIndex: 1,
      }),
    );
  });
});
