import type { TTSConfig } from "@readany/core/tts";
import {
  BrowserTTSPlayer,
  DashScopeTTSPlayer,
  EdgeTTSPlayer,
  GeminiTTSPlayer,
  GoogleTranslateTTSPlayer,
  OpenAICompatibleTTSPlayer,
  XiaomiTTSPlayer,
} from "@readany/core/tts";

const systemPreviewPlayer = new BrowserTTSPlayer();
const edgePreviewPlayer = new EdgeTTSPlayer();
const googlePreviewPlayer = new GoogleTranslateTTSPlayer();
const geminiPreviewPlayer = new GeminiTTSPlayer();
const dashscopePreviewPlayer = new DashScopeTTSPlayer();
const xiaomiPreviewPlayer = new XiaomiTTSPlayer();
const openAICompatiblePreviewPlayer = new OpenAICompatibleTTSPlayer();

export interface TTSPreviewCallbacks {
  onStateChange?: (state: "playing" | "paused" | "stopped") => void;
  onEnd?: () => void;
}

function stopPlayer(player: { stop: () => void }) {
  try {
    player.stop();
  } catch (err) {
    console.warn("[TTS] Failed to stop preview player:", err);
  }
}

export function stopTTSPreview() {
  stopPlayer(systemPreviewPlayer);
  stopPlayer(edgePreviewPlayer);
  stopPlayer(googlePreviewPlayer);
  stopPlayer(geminiPreviewPlayer);
  stopPlayer(dashscopePreviewPlayer);
  stopPlayer(xiaomiPreviewPlayer);
  stopPlayer(openAICompatiblePreviewPlayer);
}

export async function previewTTSConfig(
  text: string,
  config: TTSConfig,
  callbacks: TTSPreviewCallbacks = {},
) {
  stopTTSPreview();
  // Preview intentionally bypasses the store's fallback chain — it tests the
  // exact engine the user selected. (The store path covers network blind
  // spots during real read-aloud; here a failure should be visible.)
  const player =
    config.engine === "edge"
      ? edgePreviewPlayer
      : config.engine === "google"
        ? googlePreviewPlayer
        : config.engine === "gemini"
          ? geminiPreviewPlayer
          : config.engine === "dashscope"
            ? dashscopePreviewPlayer
            : config.engine === "xiaomi"
              ? xiaomiPreviewPlayer
              : config.engine === "openai-compatible"
                ? openAICompatiblePreviewPlayer
                : systemPreviewPlayer;
  player.onStateChange = undefined;
  player.onEnd = undefined;
  try {
    const preview = Promise.resolve(player.speak(text, config));
    player.onStateChange = callbacks.onStateChange;
    player.onEnd = callbacks.onEnd;
    await preview;
  } catch (error) {
    console.error("[TTSPreview] Preview failed", error);
    callbacks.onStateChange?.("stopped");
  }
}
