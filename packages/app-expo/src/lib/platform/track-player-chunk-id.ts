/**
 * Helpers shared by Edge and DashScope TrackPlayer-based TTS engines.
 *
 * Both engines use react-native-track-player and run into the same trap:
 * silence keep-alive tracks (id `tts-silence-${ts}`) get inserted into the
 * TrackPlayer queue alongside the real chunk tracks (id `tts-chunk-${i}`).
 * This means TrackPlayer's queue index does not equal the chunk index
 * once silence is in play, so we must derive the chunk index from the
 * track ID instead of from the queue position.
 */

/**
 * Extract the chunk index from a track ID.
 * Returns null for silence keep-alive tracks or any non-chunk track.
 */
export function chunkIndexFromTrackId(id: unknown): number | null {
  if (typeof id !== "string") return null;
  const m = /^tts-chunk-(\d+)$/.exec(id);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Stable prefix for chunk track IDs. Both engines must use this. */
export const TTS_CHUNK_TRACK_ID_PREFIX = "tts-chunk-";

/** Build a chunk track ID from a chunk index. */
export function trackIdForChunkIndex(index: number): string {
  return `${TTS_CHUNK_TRACK_ID_PREFIX}${index}`;
}
