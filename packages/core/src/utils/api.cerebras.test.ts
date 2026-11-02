import { describe, expect, it } from "vitest";
import { getDefaultBaseUrl, formatApiHost, PROVIDER_CONFIGS } from "./api";

describe("cerebras BYOK URL resolution", () => {
  it("resolves to direct api.cerebras.ai/v1", () => {
    const base = getDefaultBaseUrl("cerebras");
    const host = formatApiHost(base);
    expect(base).toBe("https://api.cerebras.ai");
    expect(host.replace(/\/$/, "")).toBe("https://api.cerebras.ai/v1");
    expect(PROVIDER_CONFIGS.cerebras.name).toBe("Cerebras");
    expect(`${host.replace(/\/$/, "")}/chat/completions`).toBe(
      "https://api.cerebras.ai/v1/chat/completions",
    );
  });

  it("uses English provider names", () => {
    expect(PROVIDER_CONFIGS.zhipu.name).toBe("Zhipu GLM");
    expect(PROVIDER_CONFIGS.aliyun.name).toBe("Alibaba Qwen");
    expect(PROVIDER_CONFIGS.volces.name).toBe("Volcengine Doubao");
    expect(PROVIDER_CONFIGS.baichuan.name).toBe("Baichuan AI");
  });
});
