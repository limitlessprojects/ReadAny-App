import { describe, expect, it } from "vitest";
import { resolveChapterReference } from "../chapter-reference-resolver";

describe("resolveChapterReference", () => {
  const chapters = [
    {
      chapterIndex: 241,
      chapterTitle: "Section 242",
      preview: "第242章 你说，我去做\n\n一些正文。",
    },
    {
      chapterIndex: 244,
      chapterTitle: "Section 245",
      preview: "第245章 交锋\n\n难道她见了萧宝月？",
    },
    {
      chapterIndex: 245,
      chapterTitle: "Section 246",
      preview: "第246章 收尾\n\n另一章正文。",
    },
  ];

  it("matches human chapter numbers from real chapter titles, not Section numbers", () => {
    const result = resolveChapterReference("跟我讲一下245章的内容", chapters);

    expect(result.matched).toBe(true);
    expect(result.chapterIndex).toBe(244);
    expect(result.chapterTitle).toContain("第245章");
    expect(result.detectedChapterNumber).toBe(245);
  });

  it("supports Chinese numeric chapter references", () => {
    const result = resolveChapterReference("第二百四十五章讲了什么", chapters);

    expect(result.matched).toBe(true);
    expect(result.chapterIndex).toBe(244);
  });

  it("can use fuzzy title text when no chapter number is present", () => {
    const result = resolveChapterReference("交锋这一章讲什么", chapters);

    expect(result.matched).toBe(true);
    expect(result.chapterIndex).toBe(244);
  });

  it("does not trust synthetic Section titles as real chapter numbers", () => {
    const result = resolveChapterReference("第244章讲什么", chapters);

    expect(result.matched).toBe(false);
    expect(result.candidates[0]?.chapterIndex).not.toBe(244);
  });
});
