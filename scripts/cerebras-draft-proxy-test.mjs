#!/usr/bin/env node
/** One-shot Cerebras call: draft the edge-proxy unit test (recorded as the
 *  honest "how Cerebras helped" artifact; output reviewed by hand before use). */
const key = process.env.CEREBRAS_API_KEY;
const base = process.env.CEREBRAS_API_TARGET || "https://api.cerebras.ai";
const model = process.env.CEREBRAS_MODEL || "gpt-oss-120b";

const source = await import("node:fs/promises").then((fs) =>
  fs.readFile("netlify/edge-functions/lib/proxy-core.ts", "utf8"),
);

const res = await fetch(`${base}/v1/chat/completions`, {
  method: "POST",
  headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({
    model,
    stream: false,
    temperature: 0.2,
    max_completion_tokens: 4000,
    messages: [
      {
        role: "system",
        content:
          "You write concise, correct vitest tests for TypeScript edge functions. Output ONLY the test file content, no markdown fences, no commentary.",
      },
      {
        role: "user",
        content: `Write a vitest test file (node environment) for the following edge-function source. It exports handleProviderProxy(req, env) and the type ProxyEnv where env = { get(key: string): string | null | undefined }.

Cover exactly these behaviors (mock global fetch to inspect the upstream Request and return a stub Response):
1. gemini proxy with no GEMINI_API_KEY env and only the "proxy" placeholder credential → 503, JSON body has error.message containing "temporarily unavailable".
2. gemini proxy WITH GEMINI_API_KEY env: upstream fetch is called with header x-goog-api-key equal to the env key and URL starting with https://generativelanguage.googleapis.com/v1beta/models, and the response x-demo-key-source header is "env".
3. OpenAI-compat shim: GET /gemini-api/v1/chat/completions with GEMINI_API_KEY set maps upstream path to /v1beta/openai/chat/completions with Authorization: Bearer <envkey> and no x-goog-api-key header.
4. Shared-demo-key path guard: with GEMINI_API_KEY set and NO client credential, request /gemini-api/v1beta/files/upload123 → 403; request /gemini-api/v1beta/models → passes through (not 403).
5. __health: GET /gemini-api/__health with no key → 200 JSON { keyLoaded: false } and body never contains any key material.
Use vitest describe/it/expect, beforeEach to reset fetch mocks, no external deps. TS is fine.

SOURCE:
${source}`,
      },
    ],
  }),
});
if (!res.ok) {
  console.error(`Cerebras ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const data = await res.json();
const out = data.choices[0].message.content
  .replace(/^```(?:ts|typescript)?\n?/m, "")
  .replace(/\n```$/m, "");
await import("node:fs/promises").then((fs) =>
  fs.writeFile("/tmp/cerebras-proxy-test-draft.ts", out),
);
console.log(
  `draft written (${data.usage?.completion_tokens ?? "?"} completion tokens, model ${model})`,
);
