import { describe, expect, it } from "vitest";

import {
  DEFAULT_XIAOMI_TTS_VOICE,
  XIAOMI_TTS_VOICES,
  normalizeTTSConfig,
} from "./types";

describe("normalizeTTSConfig", () => {
  it("preserves persisted default profile settings", () => {
    const config = normalizeTTSConfig({
      engine: "openai-compatible",
      activeProfileId: "openai-compatible-default",
      profiles: [
        {
          id: "openai-compatible-default",
          name: "Custom OpenAI TTS",
          provider: "openai-compatible",
          baseUrl: "https://example.com/v1",
          apiKey: "secret-key",
          endpoint: "chat-completions",
          model: "custom-tts",
          voice: "reader",
          format: "wav",
          stylePrompt: "Read calmly.",
        },
      ],
    });

    expect(config.openaiTtsBaseUrl).toBe("https://example.com/v1");
    expect(config.openaiTtsApiKey).toBe("secret-key");
    expect(config.openaiTtsEndpoint).toBe("chat-completions");
    expect(config.openaiTtsModel).toBe("custom-tts");
    expect(config.openaiTtsVoice).toBe("reader");
    expect(config.openaiTtsFormat).toBe("wav");
    expect(config.openaiTtsStylePrompt).toBe("Read calmly.");
  });

  it("preserves Xiaomi profile base URL settings", () => {
    const config = normalizeTTSConfig({
      engine: "xiaomi",
      activeProfileId: "xiaomi-mimo-default",
      profiles: [
        {
          id: "xiaomi-mimo-default",
          name: "Xiaomi Token Plan",
          provider: "xiaomi",
          baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
          apiKey: "tp-secret",
          voice: "冰糖",
          model: "mimo-v2.5-tts",
          format: "pcm16",
          stylePrompt: "Read softly.",
        },
      ],
    });

    expect(config.xiaomiBaseUrl).toBe("https://token-plan-cn.xiaomimimo.com/v1");
    expect(config.xiaomiApiKey).toBe("tp-secret");
    expect(config.xiaomiVoice).toBe("冰糖");
    expect(config.xiaomiStylePrompt).toBe("Read softly.");
  });

  it("falls back from removed Xiaomi voice IDs", () => {
    const config = normalizeTTSConfig({
      engine: "xiaomi",
      xiaomiVoice: "Ethan",
      activeProfileId: "xiaomi-mimo-default",
      profiles: [
        {
          id: "xiaomi-mimo-default",
          name: "Xiaomi MiMo",
          provider: "xiaomi",
          voice: "Serena",
        },
      ],
    });

    expect(config.xiaomiVoice).toBe(DEFAULT_XIAOMI_TTS_VOICE);
    expect(config.profiles.find((profile) => profile.id === "xiaomi-mimo-default")?.voice).toBe(
      DEFAULT_XIAOMI_TTS_VOICE,
    );
  });

  it("matches Xiaomi MiMo V2.5 preset voices", () => {
    expect(XIAOMI_TTS_VOICES.map((voice) => voice.id)).toEqual([
      "mimo_default",
      "冰糖",
      "茉莉",
      "苏打",
      "白桦",
      "Mia",
      "Chloe",
      "Milo",
      "Dean",
    ]);
  });
});
