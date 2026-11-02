import { DEFAULT_TTS_CONFIG } from "@readany/core/tts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchXiaomiTTSWav, stop, reset } = vi.hoisted(() => ({
  fetchXiaomiTTSWav: vi.fn(),
  stop: vi.fn(() => Promise.resolve()),
  reset: vi.fn(() => Promise.resolve()),
}));

vi.mock("@readany/core/tts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@readany/core/tts")>()),
  fetchXiaomiTTSWav,
}));
vi.mock("expo-file-system", () => ({
  File: class {},
  Paths: { cache: "/cache" },
}));
vi.mock("react-native", () => ({
  Image: { resolveAssetSource: () => ({ uri: "icon" }) },
}));
vi.mock("react-native-track-player", () => ({
  default: {
    stop,
    reset,
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
  Event: {},
  State: {},
}));

const { TrackPlayerCloudTTSPlayer } = await import("./track-player-cloud-tts-player");

describe("TrackPlayerCloudTTSPlayer provider failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchXiaomiTTSWav.mockRejectedValue(new Error("invalid API key"));
  });

  it("reports the first synthesis failure without treating it as natural completion", async () => {
    const player = new TrackPlayerCloudTTSPlayer();
    const onError = vi.fn();
    const onEnd = vi.fn();
    player.onError = onError;
    player.onEnd = onEnd;

    await player.speak("first segment", {
      ...DEFAULT_TTS_CONFIG,
      engine: "xiaomi",
      xiaomiApiKey: "bad-key",
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
