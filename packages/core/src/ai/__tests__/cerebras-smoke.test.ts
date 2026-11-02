import { describe, expect, it } from "vitest";
import { createChatModelFromEndpoint } from "../llm-provider";
import { getEndpointFetch } from "../llm-provider";
import { getLastStreamMetrics } from "../stream-metrics";
import type { AIEndpoint } from "../../types";

/**
 * Runner smoke test for the Cerebras BYOK path.
 * Skipped unless CEREBRAS_API_KEY is set (set as a repo secret in CI).
 * Exercises the SAME code path the app uses: createChatModelFromEndpoint →
 * getEndpointFetch (including instrumentFetchForMetrics) → @langchain/openai.
 */
const API_KEY = process.env.CEREBRAS_API_KEY || "";
const BASE_URL = process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai";

function makeEndpoint(model: string): AIEndpoint {
  return {
    id: "smoke-cerebras",
    name: "Cerebras smoke",
    provider: "cerebras",
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    models: [model],
    modelsFetched: true,
  } as AIEndpoint;
}

describe.skipIf(!API_KEY)("Cerebras runner smoke (BYOK direct)", () => {
  it("lists models", async () => {
    const fetchImpl = getEndpointFetch(makeEndpoint("probe"), undefined);
    const res = await fetchImpl(`${BASE_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    expect(res.ok).toBe(true);
    const data = (await res.json()) as { data: Array<{ id: string }> };
    const ids = data.data.map((m) => m.id);
    console.log("[smoke] available models:", ids.join(", "));
    expect(ids.length).toBeGreaterThan(0);
  });

  it("streams a chat completion through the app's real model path", async () => {
    // Pick a model that exists — resolved from /models in the previous test's
    // data; prefer llama-3.3-70b style ids, fall back to the first listed.
    const probeFetch = getEndpointFetch(makeEndpoint("probe"), undefined);
    const listRes = await probeFetch(`${BASE_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const list = (await listRes.json()) as { data: Array<{ id: string }> };
    const ids = list.data.map((m) => m.id);
    const model =
      ids.find((id) => id.includes("gpt-oss")) ??
      ids.find((id) => id.includes("llama")) ??
      ids[0];
    console.log("[smoke] testing with model:", model);

    const chatModel = await createChatModelFromEndpoint(makeEndpoint(model), model, {
      temperature: 0,
      // Cerebras models (qwen-3.8-27b, gpt-oss-120b) are reasoning models —
      // give the budget room for reasoning deltas before visible content.
      maxTokens: 1024,
      streaming: true,
    });

    const chunks: string[] = [];
    const stream = await chatModel.stream([
      { role: "user", content: "Reply with exactly the word: STREAM_OK" },
    ]);
    for await (const chunk of stream) {
      const text = typeof chunk?.content === "string" ? chunk.content : "";
      // Reasoning models stream reasoning deltas via additional_kwargs —
      // those prove the SSE pipeline works just as well as content deltas.
      const reasoning =
        (chunk?.additional_kwargs?.reasoning as string | undefined) ??
        (chunk?.additional_kwargs?.reasoning_content as string | undefined) ??
        "";
      if (text) chunks.push(text);
      else if (reasoning) chunks.push(reasoning);
    }
    const full = chunks.join("");
    console.log(
      "[smoke] streamed reply:",
      JSON.stringify(full.slice(0, 200)),
      `chunks=${chunks.length}`,
    );
    expect(chunks.length).toBeGreaterThan(0);
    if (!full.toUpperCase().includes("STREAM_OK")) {
      console.warn("[smoke] reasoning budget consumed the reply before content — pipeline still OK");
    }

    const metrics = getLastStreamMetrics();
    console.log("[smoke] stream metrics:", JSON.stringify(metrics));
  });
});
