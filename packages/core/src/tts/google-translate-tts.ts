/**
 * Google Translate TTS — free, keyless speech synthesis via
 * translate.google.com/translate_tts (client=tw-ob), used as the resilience
 * engine that works from any network (unlike the Edge TTS WebSocket, which is
 * IP-blocked on some datacenter egresses, and unlike system voices, which are
 * absent in bare browser builds).
 *
 * Chunks are fetched as MP3 (≤180 chars each, sentence-split), decoded and
 * scheduled gaplessly on an AudioContext — same playback model as
 * EdgeTTSPlayer, minus the WebSocket streaming complexity.
 */

import { getPlatformService } from "../services/platform";
import { splitIntoChunks } from "./text-utils";
import type { ITTSPlayer, TTSConfig } from "./types";

const GTT_ENDPOINT = "https://translate.google.com/translate_tts";
const GTT_MAX_CHUNK = 180;
const GTT_TIMEOUT_MS = 15_000;

/** High-frequency Swahili function words — conservative auto-detection. */
const SW_MARKER_RE =
  /\b(na|ya|wa|kwa|katika|ni|hii|tafadhali|asante|unaweza|lakini|pia|sana|watu|sababu|ndiyo|hapana|karibu|eleza|muhtasari|soma)\b/gi;

/**
 * Conservative Swahili detection: ≥4 distinct high-frequency function words
 * in a reasonably long text. Shared by the Google engine (tl=sw) and the Edge
 * voice auto-switch (sw-KE-RafikiNeural).
 */
export function looksLikeSwahiliText(text: string): boolean {
  const matches = text.match(SW_MARKER_RE) ?? [];
  const distinct = new Set(matches.map((m) => m.toLowerCase()));
  return distinct.size >= 4 && text.length > 120;
}

/**
 * Resolve the `tl` language code. "auto" sniffs the text: Swahili markers →
 * "sw", CJK → "zh-CN", kana → "ja", Arabic script → "ar", else "en".
 */
export function resolveGoogleTtsLang(configured: string | undefined, text: string): string {
  if (configured && configured !== "auto") return configured;
  if (/[\u4e00-\u9fff]/.test(text)) return "zh-CN";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  if (looksLikeSwahiliText(text)) return "sw";
  return "en";
}

async function fetchChunkMp3(
  chunk: string,
  lang: string,
  speed: "0.5" | "1",
  index: number,
  total: number,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const platform = getPlatformService();
  const params = new URLSearchParams({
    ie: "UTF-8",
    q: chunk,
    tl: lang,
    client: "tw-ob",
    ttsspeed: speed,
    total: String(total),
    idx: String(index),
    textlen: String(chunk.length),
  });
  const url = `${GTT_ENDPOINT}?${params.toString()}`;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 350));
    const timeout = AbortSignal.timeout(GTT_TIMEOUT_MS);
    const composite = AbortSignal.any?.([signal, timeout]) ?? signal;
    try {
      const response = await platform.fetch(url, { signal: composite });
      if (!response.ok) {
        lastError = new Error(`Google TTS HTTP ${response.status}`);
        continue;
      }
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength < 64) {
        lastError = new Error("Google TTS returned an empty audio payload");
        continue;
      }
      return bytes;
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Google TTS request failed");
}

export class GoogleTranslateTTSPlayer implements ITTSPlayer {
  private audioCtx: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private gainNode: GainNode | null = null;
  private scheduledEnd = 0;
  private _playing = false;
  private _paused = false;
  /** Monotonic per-run token — invalidates stale async continuations. */
  private runId = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  onStateChange?: (state: "playing" | "paused" | "stopped") => void;
  onChunkChange?: (index: number, total: number) => void;
  onError?: (error: Error) => void;
  onEnd?: () => void;

  get playing() {
    return this._playing;
  }
  get paused() {
    return this._paused;
  }

  async speak(text: string | string[], config: TTSConfig): Promise<void> {
    const myRun = ++this.runId;
    this.cleanupAudio();

    const segments = Array.isArray(text) ? text.filter(Boolean) : [text];
    const fullText = segments.join(" ").trim();
    if (!fullText) {
      this.finish();
      return;
    }

    const chunks = segments.length > 1 ? segments : splitIntoChunks(fullText, GTT_MAX_CHUNK);
    const lang = resolveGoogleTtsLang(config.googleTtsLang, fullText);
    // translate_tts only supports a couple of speed presets server-side; the
    // AudioContext playbackRate below handles fine-grained rate.
    const speed: "0.5" | "1" = config.rate <= 0.75 ? "0.5" : "1";

    this._playing = true;
    this._paused = false;

    this.audioCtx = new AudioContext();
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.connect(this.audioCtx.destination);
    this.scheduledEnd = 0;
    if (this.audioCtx.state === "suspended") {
      // Bounded — resume() can hang forever in headless/no-audio-device envs.
      await Promise.race([
        this.audioCtx.resume().catch(() => {}),
        new Promise<void>((r) => setTimeout(r, 300)),
      ]);
    }
    if (myRun !== this.runId) return;

    const abort = new AbortController();
    const myAbort = abort;
    const watchdog = setInterval(() => {
      if (myRun !== this.runId) myAbort.abort();
    }, 500);

    try {
      const buffers = await Promise.all(
        chunks.map((chunk, index) => fetchChunkMp3(chunk, lang, speed, index, chunks.length, myAbort.signal)),
      );
      clearInterval(watchdog);
      if (myRun !== this.runId) return;

      const rate = Math.min(1.4, Math.max(0.7, config.rate));
      let playingNotified = false;
      for (let index = 0; index < buffers.length; index += 1) {
        // decodeAudioData detaches the input buffer — hand it a copy.
        const audioBuffer = await this.audioCtx.decodeAudioData(buffers[index]!.slice(0));
        if (myRun !== this.runId) return;

        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = rate;
        source.connect(this.gainNode!);
        const startAt = Math.max(this.audioCtx.currentTime + 0.02, this.scheduledEnd);
        source.start(startAt);
        this.scheduledEnd = startAt + audioBuffer.duration / rate;
        this.sources.add(source);
        source.onended = () => this.sources.delete(source);

        if (!playingNotified) {
          playingNotified = true;
          this.onStateChange?.("playing");
        }
        const thisIndex = index;
        const delayMs = Math.max(0, (startAt - this.audioCtx.currentTime) * 1000);
        setTimeout(() => {
          if (myRun !== this.runId || this._paused) return;
          this.onChunkChange?.(thisIndex, chunks.length);
        }, delayMs);
      }

      this.startEndPoll(myRun);
    } catch (error) {
      clearInterval(watchdog);
      if (myRun !== this.runId) return;
      this.cleanupAudio();
      this._playing = false;
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError?.(err);
      throw err;
    }
  }

  /** Poll for natural end — robust against paused contexts and clock drift. */
  private startEndPoll(myRun: number) {
    this.pollTimer = setInterval(() => {
      if (myRun !== this.runId) return;
      if (!this._playing || this._paused) return;
      if (this.audioCtx?.state === "suspended") return;
      if (!this.audioCtx) return;
      if (this.scheduledEnd > 0 && this.audioCtx.currentTime >= this.scheduledEnd - 0.05) {
        this.finish();
      }
    }, 200);
  }

  private finish() {
    this.cleanupAudio();
    this._playing = false;
    this._paused = false;
    this.onStateChange?.("stopped");
    this.onEnd?.();
  }

  private cleanupAudio() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const source of this.sources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    if (this.audioCtx) {
      const ctx = this.audioCtx;
      this.audioCtx = null;
      this.gainNode = null;
      this.scheduledEnd = 0;
      void ctx.close().catch(() => {});
    }
  }

  pause() {
    if (!this._playing || this._paused) return;
    this._paused = true;
    void this.audioCtx?.suspend().catch(() => {});
    this.onStateChange?.("paused");
  }

  resume() {
    if (!this._playing || !this._paused) return;
    this._paused = false;
    void this.audioCtx?.resume().catch(() => {});
    this.onStateChange?.("playing");
  }

  stop() {
    this.runId += 1;
    this.cleanupAudio();
    const wasActive = this._playing;
    this._playing = false;
    this._paused = false;
    if (wasActive) this.onStateChange?.("stopped");
  }
}
