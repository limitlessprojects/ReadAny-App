/**
 * Edge TTS metadata frame parser.
 *
 * The readaloud WebSocket endpoint sends two kinds of frames:
 *   - **Binary** frames: MP3 audio chunks. (Handled by edge-tts.ts.)
 *   - **Text** frames: HTTP-style "headers \r\n\r\n body". The current edge-tts.ts
 *     only inspects them for `Path:turn.end`. Everything else is dropped.
 *
 * This module parses those text frames and pulls out timing metadata that the
 * server emits when `metadataoptions.wordBoundaryEnabled` is true (already on)
 * or when the SSML contains `<bookmark mark="..."/>` elements (Phase 1 goal).
 *
 * Currently *only used by* {@link fetchEdgeTTSAudioWithMetadata} as part of the
 * Phase 1 spike. Existing playback code continues to ignore metadata frames.
 *
 * Frame body shape (Path:audio.metadata):
 * ```json
 * {"Metadata":[
 *   {"Type":"WordBoundary","Data":{"Offset":150000,"Duration":2500000,
 *     "text":{"Text":"hello","Length":5,"BoundaryType":"WordBoundary"}}},
 *   {"Type":"Bookmark","Data":{"Offset":1750000,"Name":"0"}}
 * ]}
 * ```
 *
 * Time units: Microsoft uses 100ns "ticks". 1ms = 10000 ticks.
 */

const TICKS_PER_MS = 10_000;

// ── Public types ──

export interface EdgeTTSWordBoundary {
  type: "WordBoundary";
  offsetTicks: number;
  durationTicks: number;
  text: string;
}

export interface EdgeTTSSentenceBoundary {
  type: "SentenceBoundary";
  offsetTicks: number;
  durationTicks: number;
  text: string;
}

export interface EdgeTTSBookmark {
  type: "Bookmark";
  offsetTicks: number;
  name: string;
}

export type EdgeTTSMetadataEvent =
  | EdgeTTSWordBoundary
  | EdgeTTSSentenceBoundary
  | EdgeTTSBookmark;

export interface EdgeTTSTextFrame {
  headers: Record<string, string>;
  path: string | null;
  body: string;
}

// ── Frame splitting ──

/**
 * Split a raw text frame into headers + body. Returns null if malformed.
 *
 * Edge TTS uses HTTP-like framing with `\r\n` line endings and a blank line
 * separating headers from body. Some early frames (e.g. `Path:turn.start`)
 * have empty bodies; that's fine, we still return them.
 */
export function parseEdgeTTSTextFrame(raw: string): EdgeTTSTextFrame | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const sep = raw.indexOf("\r\n\r\n");
  if (sep < 0) return null;

  const headerBlock = raw.slice(0, sep);
  const body = raw.slice(sep + 4);

  const headers: Record<string, string> = {};
  for (const line of headerBlock.split("\r\n")) {
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key) headers[key] = value;
  }

  // Header keys are case-insensitive in practice; Edge sends "Path" but we
  // accept any case.
  const path =
    headers.Path ?? headers.path ?? headers.PATH ?? findHeaderCaseInsensitive(headers, "path");

  return { headers, path, body };
}

function findHeaderCaseInsensitive(
  headers: Record<string, string>,
  key: string,
): string | null {
  const lower = key.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k];
  }
  return null;
}

// ── Body parsing ──

/**
 * Parse an `audio.metadata` body into a list of recognized events.
 * Unknown event types are skipped silently.
 */
export function parseEdgeTTSMetadataBody(body: string): EdgeTTSMetadataEvent[] {
  if (!body) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const metadata = (parsed as { Metadata?: unknown }).Metadata;
  if (!Array.isArray(metadata)) return [];

  const events: EdgeTTSMetadataEvent[] = [];
  for (const item of metadata) {
    const ev = parseEdgeTTSMetadataItem(item);
    if (ev) events.push(ev);
  }
  return events;
}

function parseEdgeTTSMetadataItem(item: unknown): EdgeTTSMetadataEvent | null {
  if (!item || typeof item !== "object") return null;
  const type = (item as { Type?: unknown }).Type;
  const data = (item as { Data?: unknown }).Data;
  if (typeof type !== "string" || !data || typeof data !== "object") return null;

  if (type === "WordBoundary" || type === "SentenceBoundary") {
    const offset = readNumber(data, "Offset");
    const duration = readNumber(data, "Duration");
    if (offset == null || duration == null) return null;

    // text: { Text, Length, BoundaryType }
    const textObj = (data as { text?: unknown }).text;
    let textValue = "";
    if (textObj && typeof textObj === "object") {
      const t = (textObj as { Text?: unknown }).Text;
      if (typeof t === "string") textValue = t;
    }

    return {
      type,
      offsetTicks: offset,
      durationTicks: duration,
      text: textValue,
    };
  }

  if (type === "Bookmark") {
    const offset = readNumber(data, "Offset");
    const name = readString(data, "Name");
    if (offset == null || name == null) return null;
    return { type: "Bookmark", offsetTicks: offset, name };
  }

  return null;
}

function readNumber(obj: object, key: string): number | null {
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readString(obj: object, key: string): string | null {
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

// ── Conveniences ──

/**
 * Convert Microsoft's 100ns ticks to milliseconds (rounded down).
 */
export function edgeTTSTicksToMs(ticks: number): number {
  return Math.floor(ticks / TICKS_PER_MS);
}

/**
 * Top-level helper: given a raw text frame, return any metadata events it
 * contains. Returns empty array for non-metadata frames.
 */
export function extractEdgeTTSMetadataEvents(rawFrame: string): EdgeTTSMetadataEvent[] {
  const frame = parseEdgeTTSTextFrame(rawFrame);
  if (!frame) return [];
  const path = frame.path?.toLowerCase() ?? "";
  if (!path.startsWith("audio.metadata")) return [];
  return parseEdgeTTSMetadataBody(frame.body);
}
