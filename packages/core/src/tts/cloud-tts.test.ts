import { describe, expect, it } from "vitest";

import { buildXiaomiTTSUrl, isTTSAbortError } from "./cloud-tts";
import { DEFAULT_TTS_CONFIG } from "./types";

describe("buildXiaomiTTSUrl", () => {
  it("uses the default Xiaomi MiMo base URL", () => {
    expect(buildXiaomiTTSUrl(DEFAULT_TTS_CONFIG)).toBe(
      "https://api.xiaomimimo.com/v1/chat/completions",
    );
  });

  it("supports Xiaomi Token Plan base URL", () => {
    expect(
      buildXiaomiTTSUrl({
        xiaomiBaseUrl: "https://token-plan-cn.xiaomimimo.com/v1/",
      }),
    ).toBe("https://token-plan-cn.xiaomimimo.com/v1/chat/completions");
  });
});

describe("isTTSAbortError", () => {
  it("recognizes abort and cancellation errors from different runtimes", () => {
    expect(isTTSAbortError(new DOMException("The operation was aborted", "AbortError"))).toBe(
      true,
    );
    expect(isTTSAbortError(new Error("Request cancelled"))).toBe(true);
    expect(isTTSAbortError(new Error("Request canceled"))).toBe(true);
    expect(isTTSAbortError({ code: "ERR_CANCELED", message: "canceled" })).toBe(true);
  });

  it("does not classify regular provider failures as aborts", () => {
    expect(isTTSAbortError(new Error("Xiaomi MiMo TTS failed: 400"))).toBe(false);
  });
});
