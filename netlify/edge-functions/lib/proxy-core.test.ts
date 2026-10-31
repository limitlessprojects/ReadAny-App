import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Regression tests for the Netlify edge provider proxy.
//
// Drafted with Cerebras gpt-oss-120b (scripts/cerebras-draft-proxy-test.mjs),
// then reviewed and extended by hand: fixed the import path, added the
// BYOK-passthrough-on-keyless-proxy case, and tightened the key-leak checks.
// These tests lock in the security posture after the gist key broker was
// removed (see proxy-core.ts header).
import { type ProxyEnv, handleProviderProxy } from "./proxy-core";

function mockEnv(values: Record<string, string | undefined>): ProxyEnv {
  return { get: (key: string) => (key in values ? values[key] : undefined) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("handleProviderProxy — key custody", () => {
  it("503s with a readable message when there is no env key and only the proxy placeholder", async () => {
    const env = mockEnv({ GEMINI_API_KEY: undefined });
    const req = new Request("http://localhost/gemini-api/v1beta/models?key=proxy");
    const res = await handleProviderProxy(req, env);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.message).toContain("temporarily unavailable");
    // Fail-fast must happen BEFORE any upstream call.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("injects the env key as x-goog-api-key on the native surface and reports keySource=env", async () => {
    const env = mockEnv({ GEMINI_API_KEY: "env-demo-key" });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("ok", { status: 200, headers: { "content-type": "application/json" } }),
    );
    const req = new Request("http://localhost/gemini-api/v1beta/models");
    const res = await handleProviderProxy(req, env);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models/);
    expect((init.headers as Headers).get("x-goog-api-key")).toBe("env-demo-key");
    expect(res.headers.get("x-demo-key-source")).toBe("env");
  });

  it("maps /v1/chat/completions onto Gemini's OpenAI-compat surface with Bearer auth only", async () => {
    const env = mockEnv({ GEMINI_API_KEY: "env-demo-key" });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("ok", { status: 200, headers: { "content-type": "application/json" } }),
    );
    const req = new Request("http://localhost/gemini-api/v1/chat/completions");
    const res = await handleProviderProxy(req, env);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toMatch(
      /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions/,
    );
    expect((init.headers as Headers).get("authorization")).toBe("Bearer env-demo-key");
    expect((init.headers as Headers).has("x-goog-api-key")).toBe(false);
    expect(res.headers.get("x-demo-key-source")).toBe("env");
  });

  it("never mixes credential families: a BYOK Bearer key passes through untouched", async () => {
    const env = mockEnv({ GEMINI_API_KEY: "env-demo-key" });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("ok", { status: 200, headers: { "content-type": "application/json" } }),
    );
    const req = new Request("http://localhost/gemini-api/v1beta/models", {
      headers: { authorization: "Bearer byok-user-key" },
    });
    await handleProviderProxy(req, env);
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    // BYOK credential must reach upstream unmodified; the server key must NOT.
    expect((init.headers as Headers).get("authorization")).toBe("Bearer byok-user-key");
    expect((init.headers as Headers).get("x-goog-api-key")).toBeNull();
  });
});

describe("handleProviderProxy — shared demo key path guard", () => {
  it("403s when the shared key would hit a non-chat/model endpoint", async () => {
    const env = mockEnv({ GEMINI_API_KEY: "env-demo-key" });
    const req = new Request("http://localhost/gemini-api/v1beta/files/upload123");
    const res = await handleProviderProxy(req, env);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain("not available on the shared demo key");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows chat, models and generateContent paths through", async () => {
    const env = mockEnv({ GEMINI_API_KEY: "env-demo-key" });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("ok", { status: 200, headers: { "content-type": "application/json" } }),
    );
    for (const path of [
      "/gemini-api/v1beta/models",
      "/gemini-api/v1beta/openai/chat/completions",
      "/gemini-api/v1beta/models/gemini-3.1-flash-lite:generateContent",
    ]) {
      const res = await handleProviderProxy(new Request(`http://localhost${path}`), env);
      expect(res.status).toBe(200);
    }
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe("handleProviderProxy — __health diagnostic", () => {
  it("reports keyLoaded=false when no env key is set and never leaks key material", async () => {
    const env = mockEnv({ GEMINI_API_KEY: undefined });
    const res = await handleProviderProxy(new Request("http://localhost/gemini-api/__health"), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keyLoaded).toBe(false);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("env-demo-key");
    expect(raw).not.toContain("AQ."); // Google key material never appears
  });

  it("reports keyLoaded=true and probes Google when a key exists", async () => {
    const env = mockEnv({ GEMINI_API_KEY: "env-demo-key" });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const res = await handleProviderProxy(new Request("http://localhost/gemini-api/__health"), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keyLoaded).toBe(true);
    expect(body.googleModelsStatus).toBe(200);
    // The probe used the key server-side; the response body must not contain it.
    expect(JSON.stringify(body)).not.toContain("env-demo-key");
  });
});
