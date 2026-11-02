import * as Speech from "expo-speech";
import { Platform } from "react-native";
import { compareVoiceLanguage } from "@readany/core/tts";
import SystemTtsSynthesis from "../../../modules/system-tts-synthesis";

export const DEFAULT_SYSTEM_VOICE_VALUE = "__default__";

export interface NativeSystemVoiceOption {
  id: string;
  label: string;
  lang: string;
  quality?: string;
}

export async function getSystemVoiceOptionsAsync(): Promise<NativeSystemVoiceOption[]> {
  try {
    // On Android, expo-speech creates a separate TextToSpeech instance for
    // getAvailableVoicesAsync(). Some vendor engines (notably ColorOS) crash
    // in that second instance's onInit callback while another TTS is active.
    // Reuse the app's synthesis module instead.
    const voices =
      Platform.OS === "android"
        ? await SystemTtsSynthesis.getVoices()
        : await Speech.getAvailableVoicesAsync();
    const deduped = new Map<string, NativeSystemVoiceOption>();
    for (const voice of voices) {
      const option = {
        id: voice.identifier,
        label: voice.name || voice.identifier,
        lang: voice.language || "und",
        quality: voice.quality,
      };
      const existing = deduped.get(option.id);
      if (!existing || (existing.quality !== "Enhanced" && option.quality === "Enhanced")) {
        deduped.set(option.id, option);
      }
    }
    return Array.from(deduped.values()).sort((a, b) => a.label.localeCompare(b.label));
  } catch (error) {
    console.warn("[SystemVoices] Failed to load native system voices", error);
    return [];
  }
}

export function groupSystemVoiceOptions(
  voices: NativeSystemVoiceOption[],
): Array<[string, NativeSystemVoiceOption[]]> {
  const grouped = new Map<string, NativeSystemVoiceOption[]>();
  for (const voice of voices) {
    const bucket = grouped.get(voice.lang) || [];
    bucket.push(voice);
    grouped.set(voice.lang, bucket);
  }
  return Array.from(grouped.entries())
    .sort(([a], [b]) => compareVoiceLanguage(a, b))
    .map(([lang, items]) => [
      lang,
      [...items].sort((a, b) => a.label.localeCompare(b.label)),
    ] as [string, NativeSystemVoiceOption[]]);
}

export function resolveSystemVoiceValue(
  selectedVoice: string | null | undefined,
  voices: NativeSystemVoiceOption[],
): string {
  if (!selectedVoice) return DEFAULT_SYSTEM_VOICE_VALUE;
  const match = voices.find((voice) => voice.id === selectedVoice || voice.label === selectedVoice);
  return match?.id || DEFAULT_SYSTEM_VOICE_VALUE;
}

export function findSystemVoiceLabel(
  selectedVoice: string | null | undefined,
  voices: NativeSystemVoiceOption[],
): string {
  if (!selectedVoice) return "";
  return voices.find((voice) => voice.id === selectedVoice || voice.label === selectedVoice)?.label || "";
}
