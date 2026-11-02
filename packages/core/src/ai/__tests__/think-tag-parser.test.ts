import { describe, expect, it } from "vitest";
import { ThinkTagStreamParser } from "../think-tag-parser";

describe("ThinkTagStreamParser", () => {
  it("splits visible text and reasoning in a single chunk", () => {
    const parser = new ThinkTagStreamParser();

    const events = parser.push("开头<think>先查统计</think>结尾");

    expect(events).toEqual([
      { type: "token", content: "开头" },
      { type: "reasoning", content: "先查统计" },
      { type: "token", content: "结尾" },
    ]);
  });

  it("supports think tags split across streaming chunks", () => {
    const parser = new ThinkTagStreamParser();

    const events = [
      ...parser.push("<thi"),
      ...parser.push("nk>让我"),
      ...parser.push("先整理一下</th"),
      ...parser.push("ink>好的"),
      ...parser.flush(),
    ];

    expect(events).toEqual([
      { type: "reasoning", content: "让我" },
      { type: "reasoning", content: "先整理一下" },
      { type: "token", content: "好的" },
    ]);
  });

  it("keeps plain text untouched when no think tags exist", () => {
    const parser = new ThinkTagStreamParser();

    const events = [...parser.push("普通回复"), ...parser.flush()];

    expect(events).toEqual([{ type: "token", content: "普通回复" }]);
  });

  it("flushes unfinished reasoning blocks as reasoning content", () => {
    const parser = new ThinkTagStreamParser();

    const events = [...parser.push("<think>还没闭合"), ...parser.flush()];

    expect(events).toEqual([{ type: "reasoning", content: "还没闭合" }]);
  });
});
