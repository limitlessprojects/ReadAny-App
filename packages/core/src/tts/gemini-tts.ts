/**
 * Gemini TTS — Google's neural speech generation via the Gemini API
 * `generateContent` surface (the same surface the official SDKs use for
 * gemini-3.8-flash(-lite)-tts / gemini-2.5-flash-preview-tts).
 *
 * This is the "sounds too AI" fix: studio-grade prebuilt voices with natural
 * prosody, auto language detection (English, Kiswahili, and 100+ more), and
 * inline non-speech vocal tags (<sigh>, <laugh>, <short pause>) supported by
 * the 3.x models.
 *
 * Network path mirrors the chat integration:
 *   web      → platform.fetch rewrites generativelanguage.googleapis.com to
 *              the /gemini-api vite proxy, which injects the server-side key
 *              (GEMINI_API_KEY) — the key never ships to the client.
 *   desktop  → direct; an optional per-profile key (geminiTtsApiKey) is sent
 *              as x-goog-api-key.
 *
 * Failures (geo-block, quota, offline) surface via onError/speak rejection so
 * the store's fallback chain (gemini → edge → google → system) takes over.
 */

import { getPlatformService } from "../services/platform";
import { base64ToBytes } from "./cloud-tts";
import { splitIntoChunks } from "./text-utils";
import { DEFAULT_GEMINI_TTS_MODEL, DEFAULT_GEMINI_TTS_VOICE, type ITTSPlayer, type TTSConfig } from "./types";

const GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com";
/** Gemini TTS handles long passages well; 600 chars keeps latency per chunk low. */
const GEMINI_TTS_MAX_CHUNK = 600;
const GEMINI_TTS_TIMEOUT_MS = 30_000;

export function buildGeminiTTSUrl(model: string): string {
  const safeModel = (model || DEFAULT_GEMINI_TTS_MODEL).replace(/[^a-zA-Z0-9.\-_]/g, "");
  return `${GEMINI_API_ORIGIN}/v1beta/models/${safeModel}:generateContent`;
}

/**
 * 2.5-era models take the style direction inline ("Say cheerfully: …").
 * 3.x models treat text as a verbatim transcript — a prefix would be read
 * aloud — so the style hint is deliberately omitted there (the prebuilt
 * voices already carry the delivery character).
 */
export function buildGeminiTTSText(chunk: string, config: TTSConfig): string {
  const style = config.geminiStylePrompt?.trim();
  if (style && config.geminiTtsModel.startsWith("gemini-2.5")) {
    return `${style}: ${chunk}`;
  }
  return chunk;
}

export function buildGeminiTTSBody(chunk: string, config: TTSConfig): Record<string, unknown> {
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: buildGeminiTTSText(chunk, config) }],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: config.geminiVoice || DEFAULT_GEMINI_TTS_VOICE },
        },
      },
    },
  };
}

interface InlineAudio {
  mimeType: string;
  bytes: Uint8Array;
}

function extractInlineAudio(payload: unknown): InlineAudio | null {
  const candidates = (payload as { candidates?: Array<unknown> })?.candidates ?? [];
  for (const candidate of candidates) {
    const parts = (candidate as { content?: { parts?: Array<unknown> } })?.content?.parts ?? [];
    for (const part of parts) {
      const inline = (part as { inlineData?: { mimeType?: string; data?: string } })?.inlineData;
      if (inline?.data) {
        try {
          return { mimeType: inline.mimeType ?? "", bytes: base64ToBytes(inline.data) };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function fetchChunkAudio(
  chunk: string,
  config: TTSConfig,
  signal: AbortSignal,
): Promise<InlineAudio> {
  const platform = getPlatformService();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.geminiTtsApiKey) {
    headers["x-goog-api-key"] = config.geminiTtsApiKey;
  }
  const timeout = AbortSignal.timeout(GEMINI_TTS_TIMEOUT_MS);
  const composite = AbortSignal.any?.([signal, timeout]) ?? signal;
  const response = await platform.fetch(buildGeminiTTSUrl(config.geminiTtsModel), {
    method: "POST",
    headers,
    body: JSON.stringify(buildGeminiTTSBody(chunk, config)),
    signal: composite,
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).trim();
    } catch {
      /* body unreadable */
    }
    const suffix = detail ? ` — ${detail.slice(0, 300)}` : "";
    throw new Error(`Gemini TTS failed: ${response.status}${suffix}`);
  }
  const payload = await response.json();
  const audio = extractInlineAudio(payload);
  if (!audio || audio.bytes.byteLength < 64) {
    throw new Error("Gemini TTS returned no audio payload");
  }
  return audio;
}

/** Decode inlineData into an AudioBuffer — raw L16/PCM or containered (wav/mp3). */
async function decodeInlineAudio(
  ctx: AudioContext,
  audio: InlineAudio,
): Promise<AudioBuffer> {
  if (/l16|pcm/i.test(audio.mimeType) && !/wav|mpeg|ogg/i.test(audio.mimeType)) {
    const rateMatch = audio.mimeType.match(/rate=(\d+)/i);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    const sampleCount = Math.floor(audio.bytes.byteLength / 2);
    if (sampleCount === 0) throw new Error("Gemini TTS PCM payload is empty");
    const int16 = new Int16Array(audio.bytes.buffer, audio.bytes.byteOffset, sampleCount);
    const buffer = ctx.createBuffer(1, sampleCount, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) {
      channel[i] = int16[i]! / 32768;
    }
    return buffer;
  }
  // Containered format (audio/wav, audio/mpeg from dev mock, …) — let the
  // WebAudio decoder handle it. decodeAudioData detaches the buffer — copy.
  return ctx.decodeAudioData(audio.bytes.slice(0).slice().buffer as ArrayBuffer);
}

export class GeminiTTSPlayer implements ITTSPlayer {
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

    const chunks =
      segments.length > 1 ? segments : splitIntoChunks(fullText, GEMINI_TTS_MAX_CHUNK);

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

    try {
      const rate = Math.min(1.4, Math.max(0.7, config.rate));
      let playingNotified = false;
      for (let index = 0; index < chunks.length; index += 1) {
        // Sequential fetch + schedule: keeps free-tier request pacing friendly
        // and lets the fallback chain bail out after the first hard failure.
        const audio = await fetchChunkAudio(chunks[index]!, config, this.abortFor(myRun));
        if (myRun !== this.runId) return;
        const audioBuffer = await decodeInlineAudio(this.audioCtx, audio);
        if (myRun !== this.runId || !this.audioCtx || !this.gainNode) return;

        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = rate;
        source.connect(this.gainNode);
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
      if (myRun !== this.runId) return;
      this.cleanupAudio();
      this._playing = false;
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError?.(err);
      throw err;
    }
  }

  /** Abort signal that fires when the run is invalidated (stop/new speak). */
  private abortFor(myRun: number): AbortSignal {
    const controller = new AbortController();
    const check = setInterval(() => {
      if (myRun !== this.runId) {
        controller.abort();
        clearInterval(check);
      }
    }, 400);
    // Clear the interval when the controller is no longer needed.
    const origAbort = controller.abort.bind(controller);
    controller.abort = () => {
      clearInterval(check);
      origAbort();
    };
    setTimeout(() => clearInterval(check), GEMINI_TTS_TIMEOUT_MS + 5_000);
    return controller.signal;
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
