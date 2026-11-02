#!/usr/bin/env node
/**
 * Regenerate landing/demo-cache.json from REAL Cerebras calls, recording the
 * measured time-to-first-token and tokens/sec for each answer.
 *
 *   CEREBRAS_API_KEY=csk-... node scripts/generate-demo-cache.mjs
 *   CEREBRAS_MODEL=llama-3.3-70b   (optional; run `--list` to see what your key can use)
 *
 * After it runs, the demo page labels the answers "recorded from <model>" with
 * the real numbers. Until you run it, the page says "sample response".
 */
import { readFile, writeFile } from "node:fs/promises";

const key = process.env.CEREBRAS_API_KEY;
const model = process.env.CEREBRAS_MODEL || "llama-3.3-70b";
const base = process.env.CEREBRAS_API_TARGET || "https://api.cerebras.ai";
const file = new URL("../landing/demo-cache.json", import.meta.url);

if (!key) {
  console.error("Set CEREBRAS_API_KEY first.");
  process.exit(1);
}

if (process.argv.includes("--list")) {
  const r = await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${key}` } });
  console.log(r.status, await r.text());
  process.exit(0);
}

const cache = JSON.parse(await readFile(file, "utf8"));

async function ask(passage, question) {
  const t0 = performance.now();
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a reading assistant. Answer only from the passage. Be concise. Reply in the language of the question.",
        },
        { role: "user", content: `Passage:\n${passage}\n\nQuestion: ${question}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Cerebras ${res.status}: ${await res.text()}`);

  let ttft = null;
  let text = "";
  let chunks = 0;
  let usageTokens = null;
  const decoder = new TextDecoder();
  let buf = "";
  for await (const part of res.body) {
    buf += decoder.decode(part, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const json = JSON.parse(data);
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) {
        if (ttft === null) ttft = performance.now() - t0;
        text += delta;
        chunks += 1;
      }
      if (json.usage?.completion_tokens) usageTokens = json.usage.completion_tokens;
    }
  }
  const totalMs = performance.now() - t0;
  const tokens = usageTokens ?? chunks; // chunk count ≈ tokens when usage isn't streamed
  const genMs = Math.max(totalMs - (ttft ?? 0), 1);
  return {
    answer: text.trim(),
    metrics: {
      ttftMs: Math.round(ttft ?? totalMs),
      totalMs: Math.round(totalMs),
      tokens,
      tokensExact: usageTokens !== null,
      tokPerSec: Math.round((tokens / genMs) * 1000),
    },
  };
}

for (const item of cache.items) {
  process.stdout.write(`• ${item.id} … `);
  const out = await ask(cache.passage.text, item.question);
  item.answer = out.answer;
  item.metrics = out.metrics;
  console.log(`${out.metrics.ttftMs} ms TTFT, ${out.metrics.tokPerSec} tok/s`);
}

cache.source = "cerebras";
cache.model = model;
cache.generatedAt = new Date().toISOString();
await writeFile(file, `${JSON.stringify(cache, null, 2)}\n`);
console.log(`Wrote landing/demo-cache.json (${model}). Commit and push to update the live demo.`);
