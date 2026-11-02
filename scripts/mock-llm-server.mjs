#!/usr/bin/env node
/**
 * Mock LLM server — OpenAI-compatible, SSE streaming, Gemini-shaped.
 *
 * DEV/TEST ONLY. Serves the same wire shape as Gemini's OpenAI-compatible
 * endpoint (POST /v1beta/openai/chat/completions) so the app's streaming
 * pipeline can be exercised end to end when generativelanguage.googleapis.com
 * is unreachable (e.g. geo-blocked CI sandboxes — HK egress hits
 * "User location is not supported"). Replies are natural, product-quality
 * reading-assistant answers in English or Swahili (detected from the prompt) —
 * the mock must never leak dev/env/debug chatter into the UI.
 *
 * Usage: node scripts/mock-llm-server.mjs [port]   (default 8787)
 *
 * Endpoints (path-suffix matched, so /v1/... and /v1beta/openai/... both work):
 *   GET  any path ending in /models
 *   POST any path ending in /chat/completions  (stream: true → SSE; otherwise JSON)
 *   POST any path ending in :generateContent   (native surface — emulates Gemini
 *        TTS when generationConfig.responseModalities includes "AUDIO": returns
 *        candidates[0].content.parts[0].inlineData audio. Audio comes from
 *        translate_tts (same voices as the app's Google engine) when the
 *        network allows, else a generated silence WAV so the player path is
 *        always exercisable.)
 */

import http from "node:http";

const PORT = Number(process.argv[2] || process.env.MOCK_LLM_PORT || 8787);

const MODELS = [
  { id: "gemini-3.8-flash", object: "model", owned_by: "google", context_window: 1048576 },
  { id: "gemini-3.8-flash-lite", object: "model", owned_by: "google", context_window: 1048576 },
  { id: "gemini-3-pro", object: "model", owned_by: "google", context_window: 1048576 },
];

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/** Split into small token-ish chunks to simulate real streaming pacing. */
function tokenize(text) {
  return text.match(/\s*\S+/g) ?? [text];
}

const SWAHILI_MARKERS = /\b(na|ya|wa|kwa|katika|nisaidie|eleza|muhtasari|tafadhali|asante|hii|ni|unaweza|soma|hati|waraka)\b/i;

/** Last user text, flattening LangChain-style content arrays. */
function lastUserPrompt(messages) {
  const last = [...(messages ?? [])].reverse().find((m) => m.role === "user");
  if (!last) return "";
  const content = last.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : p?.text ?? ""))
      .join(" ");
  }
  return String(content ?? "");
}

function topicOf(prompt) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  const withoutContext = cleaned.split(/\n\n+/).pop() || cleaned;
  return withoutContext.slice(0, 120);
}

function makeReply(messages) {
  const prompt = lastUserPrompt(messages);
  const topic = topicOf(prompt) || "hii";
  const isSwahili = SWAHILI_MARKERS.test(prompt);

  if (isSwahili) {
    return [
      `Karibu! Kuhusu **${topic}** — hii ni muhtasari mfupi.`,
      "",
      "### Mambo makuu",
      "- Waraka huu unaeleza mada kwa undani, na sehemu za kwanza zinaongelea misingi ya somo.",
      "- Waandishi wanatoa mifano halisi inayosaidia kuelewa dhana kwa urahisi.",
      "- Hitimisho lina mapendekezo ya vitendo unayoweza kutekeleza sasa.",
      "",
      "Ungependa nikusome sehemu fulani kwa sauti, au nikupeleke kwa lugha nyingine?",
    ].join("\n");
  }

  return [
    `Happy to help with **${topic}** — here's a quick rundown.`,
    "",
    "### Key points",
    "- The document opens by framing the core problem, then walks through the method step by step.",
    "- The middle sections back each claim with real examples and numbers you can verify.",
    "- The conclusion wraps up with practical takeaways you can act on right away.",
    "",
    "Want me to read this aloud, translate it, or dig deeper into any section?",
  ].join("\n");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname.replace(/\/+$/, "");

  if (req.method === "GET" && path.endsWith("/models")) {
    return json(res, 200, { object: "list", data: MODELS });
  }

  // ---- Native generateContent surface (Gemini TTS emulation) ----
  if (req.method === "POST" && path.endsWith(":generateContent")) {
    let body;
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {
      return json(res, 400, { error: { code: 400, message: "invalid JSON body", status: "INVALID_ARGUMENT" } });
    }

    const modalities = body.generationConfig?.responseModalities ?? [];
    if (!modalities.includes("AUDIO")) {
      return json(res, 400, {
        error: { code: 400, message: "mock: only AUDIO responseModalities are emulated", status: "INVALID_ARGUMENT" },
      });
    }

    const text = (body.contents ?? [])
      .flatMap((c) => (c.parts ?? []).map((p) => p.text ?? ""))
      .join(" ")
      .trim();
    if (!text) {
      return json(res, 400, { error: { code: 400, message: "mock: no text to speak", status: "INVALID_ARGUMENT" } });
    }

    const voice =
      body.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName ?? "LEDA";
    const model = decodeURIComponent(path.split("/models/").pop() ?? "").replace(":generateContent", "");

    let audio;
    let mimeType;
    try {
      audio = await synthesizeMp3(text);
      mimeType = "audio/mpeg";
    } catch {
      audio = silenceWav(Math.min(6, Math.max(1.2, text.length / 14)));
      mimeType = "audio/wav";
    }

    return json(res, 200, {
      candidates: [
        {
          content: { role: "model", parts: [{ inlineData: { mimeType, data: audio.toString("base64") } }] },
          finishReason: "STOP",
          index: 0,
          safetyRatings: [],
        },
      ],
      modelVersion: model,
      usageMetadata: {
        promptTokenCount: Math.ceil(text.length / 4),
        candidatesTokenCount: Math.ceil(audio.length / 180),
        totalTokenCount: Math.ceil(text.length / 4) + Math.ceil(audio.length / 180),
      },
    });
  }

  if (req.method === "POST" && path.endsWith("/chat/completions")) {
    let body;
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {
      return json(res, 400, { error: { message: "invalid JSON body" } });
    }

    const id = `chatcmpl-mock-${Date.now().toString(36)}`;
    const created = Math.floor(Date.now() / 1000);
    const model = body.model ?? "gemini-3.8-flash";
    const reply = makeReply(body.messages);

    if (!body.stream) {
      await new Promise((r) => setTimeout(r, 120));
      return json(res, 200, {
        id,
        object: "chat.completion",
        created,
        model,
        choices: [
          { index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" },
        ],
        usage: {
          prompt_tokens: Math.ceil((body.messages?.map((m) => String(m.content).length).join("") ?? "").length / 4),
          completion_tokens: Math.ceil(reply.length / 4),
          total_tokens: 0,
        },
        time_info: { queue_time: 0.001, prompt_time: 0.01, completion_time: 0.05, total_time: 0.12 },
      });
    }

    // SSE streaming
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
      "x-accel-buffering": "no",
    });

    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    const base = { id, object: "chat.completion.chunk", created, model };

    // first chunk: role
    send({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] });

    const tokens = tokenize(reply);
    const pacing = Number(body.__mock_pace_ms ?? 12);
    let i = 0;
    for (const token of tokens) {
      if (res.closed) return;
      send({ ...base, choices: [{ index: 0, delta: { content: token }, finish_reason: null }] });
      i += 1;
      if (i % 8 === 0) await new Promise((r) => setTimeout(r, pacing));
    }

    send({
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 42, completion_tokens: tokens.length, total_tokens: 42 + tokens.length },
    });
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  return json(res, 404, { error: { message: `mock: no route for ${req.method} ${url.pathname}` } });
});

// ---- TTS audio synthesis helpers (translate_tts-backed, offline-safe) ----

const GTTS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

function splitPieces(text, max = 180) {
  const words = text.split(/\s+/);
  const pieces = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > max && cur) {
      pieces.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) pieces.push(cur);
  return pieces.length ? pieces : [text.slice(0, max)];
}

async function gttsPiece(piece, lang) {
  const params = new URLSearchParams({
    ie: "UTF-8",
    q: piece,
    tl: lang,
    client: "tw-ob",
    ttsspeed: "1",
    total: "1",
    idx: "0",
    textlen: String(piece.length),
  });
  const response = await fetch(`https://translate.google.com/translate_tts?${params}`, {
    headers: { "User-Agent": GTTS_UA, Referer: "https://translate.google.com/" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`gtts HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 64) throw new Error("gtts empty payload");
  return bytes;
}

/** Synthesize MP3 audio via translate_tts (same voices as the app's Google engine). */
async function synthesizeMp3(text) {
  const lang = SWAHILI_MARKERS.test(text) ? "sw" : "en";
  const pieces = splitPieces(text);
  const buffers = [];
  for (const piece of pieces) {
    buffers.push(await gttsPiece(piece, lang));
  }
  return Buffer.concat(buffers);
}

/** 16-bit mono WAV with silence — offline fallback so the player path stays testable. */
function silenceWav(seconds, rate = 24000) {
  const samples = Math.max(1, Math.floor(seconds * rate));
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-llm] listening on http://127.0.0.1:${PORT} (dev/test only — Gemini-shaped)`);
});
