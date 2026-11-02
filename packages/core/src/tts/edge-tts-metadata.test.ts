import { describe, expect, it } from "vitest";
import {
  edgeTTSTicksToMs,
  extractEdgeTTSMetadataEvents,
  parseEdgeTTSMetadataBody,
  parseEdgeTTSTextFrame,
} from "./edge-tts-metadata";

const CRLF = "\r\n";

describe("parseEdgeTTSTextFrame", () => {
  it("splits a well-formed frame into headers + body + path", () => {
    const raw = [
      "X-RequestId:abc123",
      "Content-Type:application/json; charset=utf-8",
      "Path:audio.metadata",
      "",
      '{"Metadata":[]}',
    ].join(CRLF);

    const frame = parseEdgeTTSTextFrame(raw);
    expect(frame).not.toBeNull();
    expect(frame?.headers["X-RequestId"]).toBe("abc123");
    expect(frame?.headers["Content-Type"]).toBe("application/json; charset=utf-8");
    expect(frame?.path).toBe("audio.metadata");
    expect(frame?.body).toBe('{"Metadata":[]}');
  });

  it("returns null when the header/body separator is missing", () => {
    expect(parseEdgeTTSTextFrame("Path:audio.metadata\r\nNo body separator")).toBeNull();
    expect(parseEdgeTTSTextFrame("")).toBeNull();
  });

  it("handles empty bodies (turn.start has no body)", () => {
    const raw = ["X-RequestId:r1", "Path:turn.start", "", ""].join(CRLF);
    const frame = parseEdgeTTSTextFrame(raw);
    expect(frame?.path).toBe("turn.start");
    expect(frame?.body).toBe("");
  });

  it("looks up Path case-insensitively", () => {
    const raw = ["X-RequestId:r1", "path:audio.metadata", "", "{}"].join(CRLF);
    expect(parseEdgeTTSTextFrame(raw)?.path).toBe("audio.metadata");
  });
});

describe("parseEdgeTTSMetadataBody", () => {
  it("extracts a WordBoundary event with text", () => {
    const body = JSON.stringify({
      Metadata: [
        {
          Type: "WordBoundary",
          Data: {
            Offset: 1_500_000,
            Duration: 2_500_000,
            text: { Text: "hello", Length: 5, BoundaryType: "WordBoundary" },
          },
        },
      ],
    });
    const events = parseEdgeTTSMetadataBody(body);
    expect(events).toEqual([
      {
        type: "WordBoundary",
        offsetTicks: 1_500_000,
        durationTicks: 2_500_000,
        text: "hello",
      },
    ]);
  });

  it("extracts a Bookmark event with name (the Phase 1 goal)", () => {
    const body = JSON.stringify({
      Metadata: [
        {
          Type: "Bookmark",
          Data: { Offset: 9_000_000, Name: "0" },
        },
      ],
    });
    expect(parseEdgeTTSMetadataBody(body)).toEqual([
      { type: "Bookmark", offsetTicks: 9_000_000, name: "0" },
    ]);
  });

  it("extracts a SentenceBoundary event", () => {
    const body = JSON.stringify({
      Metadata: [
        {
          Type: "SentenceBoundary",
          Data: {
            Offset: 0,
            Duration: 50_000_000,
            text: { Text: "Hello world.", Length: 12, BoundaryType: "SentenceBoundary" },
          },
        },
      ],
    });
    expect(parseEdgeTTSMetadataBody(body)).toEqual([
      {
        type: "SentenceBoundary",
        offsetTicks: 0,
        durationTicks: 50_000_000,
        text: "Hello world.",
      },
    ]);
  });

  it("preserves order across multiple events in one frame", () => {
    const body = JSON.stringify({
      Metadata: [
        { Type: "WordBoundary", Data: { Offset: 100, Duration: 50, text: { Text: "a" } } },
        { Type: "Bookmark", Data: { Offset: 200, Name: "m1" } },
        { Type: "WordBoundary", Data: { Offset: 300, Duration: 80, text: { Text: "b" } } },
      ],
    });
    const events = parseEdgeTTSMetadataBody(body);
    expect(events.map((e) => e.type)).toEqual(["WordBoundary", "Bookmark", "WordBoundary"]);
    expect(events.map((e) => e.offsetTicks)).toEqual([100, 200, 300]);
  });

  it("skips unknown event types silently", () => {
    const body = JSON.stringify({
      Metadata: [
        { Type: "Viseme", Data: { Offset: 0, VisemeId: 5 } },
        { Type: "Bookmark", Data: { Offset: 100, Name: "kept" } },
      ],
    });
    const events = parseEdgeTTSMetadataBody(body);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "Bookmark", offsetTicks: 100, name: "kept" });
  });

  it("returns [] on malformed JSON or missing Metadata array", () => {
    expect(parseEdgeTTSMetadataBody("not json")).toEqual([]);
    expect(parseEdgeTTSMetadataBody("")).toEqual([]);
    expect(parseEdgeTTSMetadataBody("{}")).toEqual([]);
    expect(parseEdgeTTSMetadataBody('{"Metadata":"oops"}')).toEqual([]);
  });

  it("rejects events missing required fields", () => {
    const body = JSON.stringify({
      Metadata: [
        { Type: "WordBoundary", Data: { Offset: "not a number", Duration: 50, text: { Text: "x" } } },
        { Type: "Bookmark", Data: { Offset: 100 /* Name missing */ } },
        { Type: "WordBoundary", Data: { Duration: 50, text: { Text: "y" } /* Offset missing */ } },
      ],
    });
    expect(parseEdgeTTSMetadataBody(body)).toEqual([]);
  });
});

describe("extractEdgeTTSMetadataEvents (top-level)", () => {
  it("returns events for an audio.metadata frame", () => {
    const raw = [
      "Path:audio.metadata",
      "",
      JSON.stringify({
        Metadata: [{ Type: "Bookmark", Data: { Offset: 42, Name: "tag" } }],
      }),
    ].join(CRLF);
    expect(extractEdgeTTSMetadataEvents(raw)).toEqual([
      { type: "Bookmark", offsetTicks: 42, name: "tag" },
    ]);
  });

  it("returns [] for non-metadata paths (turn.start, response, etc.)", () => {
    const turnStart = ["Path:turn.start", "", ""].join(CRLF);
    const response = ["Path:response", "", "{}"].join(CRLF);
    expect(extractEdgeTTSMetadataEvents(turnStart)).toEqual([]);
    expect(extractEdgeTTSMetadataEvents(response)).toEqual([]);
  });
});

describe("edgeTTSTicksToMs", () => {
  it("converts 100ns ticks to ms (rounded down)", () => {
    expect(edgeTTSTicksToMs(0)).toBe(0);
    expect(edgeTTSTicksToMs(10_000)).toBe(1);
    expect(edgeTTSTicksToMs(15_000)).toBe(1); // floor
    expect(edgeTTSTicksToMs(10_000_000)).toBe(1000);
  });
});
