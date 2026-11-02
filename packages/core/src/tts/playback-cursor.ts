/**
 * Playback cursor for streamed TTS: maps the audio-clock time to the chunk
 * currently being heard, so progress tracks real playback instead of network speed.
 */
export interface ChunkBoundary {
  /** Chunk index within the current speak() call (0-based). */
  index: number;
  /** AudioContext-timeline start time of this chunk's first audio buffer (seconds). */
  startAt: number;
}

/**
 * Given chunk start-time boundaries (appended in ascending startAt order) and the
 * current audio-clock time, return the index of the chunk currently playing, or -1
 * if no chunk has started yet.
 */
export function resolveCurrentChunk(boundaries: ChunkBoundary[], currentTime: number): number {
  let current = -1;
  for (const b of boundaries) {
    if (b.startAt <= currentTime) current = b.index;
    else break;
  }
  return current;
}
