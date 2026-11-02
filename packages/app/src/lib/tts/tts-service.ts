/**
 * TTS Service — Thin adapter layer.
 * All core TTS logic lives in @readany/core/tts.
 * This file re-exports everything for backward compatibility.
 */

// Re-export all types, constants, and players from core
export type { TTSEngine, TTSConfig, ITTSPlayer } from "@readany/core/tts";
export {
  DEFAULT_TTS_CONFIG,
  TTS_PROVIDER_DEFINITIONS,
  XIAOMI_TTS_VOICES,
  DASHSCOPE_VOICES,
  GEMINI_TTS_VOICES,
  GEMINI_TTS_MODELS,
  GOOGLE_TTS_LANGS,
  splitIntoChunks,
  BrowserTTSPlayer,
  DashScopeTTSPlayer,
  EdgeTTSPlayer,
  GeminiTTSPlayer,
  GoogleTranslateTTSPlayer,
  OpenAICompatibleTTSPlayer,
  XiaomiTTSPlayer,
  EDGE_TTS_VOICES,
} from "@readany/core/tts";
export type { EdgeTTSVoice } from "@readany/core/tts";

// Singleton instances (kept at app level for lifecycle management)
import {
  BrowserTTSPlayer,
  DashScopeTTSPlayer,
  EdgeTTSPlayer,
  GeminiTTSPlayer,
  GoogleTranslateTTSPlayer,
  OpenAICompatibleTTSPlayer,
  XiaomiTTSPlayer,
} from "@readany/core/tts";

export const systemTTS = new BrowserTTSPlayer();
export const browserTTS = systemTTS;
export const edgeTTS = new EdgeTTSPlayer();
export const googleTTS = new GoogleTranslateTTSPlayer();
export const geminiTTS = new GeminiTTSPlayer();
export const dashscopeTTS = new DashScopeTTSPlayer();
export const xiaomiTTS = new XiaomiTTSPlayer();
export const openAICompatibleTTS = new OpenAICompatibleTTSPlayer();

/** Get available system SpeechSynthesis voices */
export function getSystemVoices(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

export const getBrowserVoices = getSystemVoices;
