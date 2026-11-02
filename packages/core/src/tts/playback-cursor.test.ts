import { describe, expect, it } from "vitest";
import { resolveCurrentChunk } from "./playback-cursor";

describe("resolveCurrentChunk", () => {
  it("returns -1 for empty boundaries", () => {
    expect(resolveCurrentChunk([], 5)).toBe(-1);
  });

  it("returns -1 before the first boundary starts", () => {
    expect(resolveCurrentChunk([{ index: 0, startAt: 1 }], 0.5)).toBe(-1);
  });

  it("returns the chunk when currentTime equals its startAt", () => {
    const b = [
      { index: 0, startAt: 0 },
      { index: 1, startAt: 10 },
    ];
    expect(resolveCurrentChunk(b, 10)).toBe(1);
  });

  it("returns the chunk whose interval contains currentTime", () => {
    const b = [
      { index: 0, startAt: 0 },
      { index: 1, startAt: 10 },
      { index: 2, startAt: 21 },
    ];
    expect(resolveCurrentChunk(b, 5)).toBe(0);
    expect(resolveCurrentChunk(b, 15)).toBe(1);
  });

  it("never runs ahead of the audio clock", () => {
    // The core anti-"runaway" guarantee: while still inside chunk 0's window,
    // it must report 0 — never the later chunks that are merely queued ahead.
    const b = [
      { index: 0, startAt: 0 },
      { index: 1, startAt: 10 },
      { index: 2, startAt: 21 },
    ];
    expect(resolveCurrentChunk(b, 9.9)).toBe(0);
    expect(resolveCurrentChunk(b, 20.9)).toBe(1);
  });

  it("returns the last chunk past the final boundary", () => {
    const b = [
      { index: 0, startAt: 0 },
      { index: 1, startAt: 10 },
    ];
    expect(resolveCurrentChunk(b, 999)).toBe(1);
  });

  it("handles skipped indices (chunks that produced no audio)", () => {
    const b = [
      { index: 0, startAt: 0 },
      { index: 2, startAt: 10 },
    ];
    expect(resolveCurrentChunk(b, 5)).toBe(0);
    expect(resolveCurrentChunk(b, 10)).toBe(2);
  });
});
