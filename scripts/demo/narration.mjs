#!/usr/bin/env node
/**
 * Demo narration generator — fetches per-scene narration audio from the
 * Google Translate TTS endpoint (works from this container; the in-app Edge
 * TTS relay works from unrestricted networks).
 *
 * Usage: node scripts/demo/narration.mjs
 * Output: /home/z/my-project/download/demo-assets/voice/scene-N.mp3 + a durations.json
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const OUT = "/home/z/my-project/download/demo-assets/voice";
fs.mkdirSync(OUT, { recursive: true });

const SCENES = [
  {
    id: "scene-1",
    lang: "en",
    text:
      "Dense research papers. On a phone. Reading them is painful, and most A I readers just summarize. We rebuilt the experience around actually understanding.",
  },
  {
    id: "scene-2",
    lang: "en",
    text:
      "Start where the paper already is. Pick it from your files. Read Any imports it locally, right in the browser. No accounts, no upload. Your library lives on your device.",
  },
  {
    id: "scene-3",
    lang: "en",
    text:
      "Open it, and ask. The answer streams from Cerebras. And we measure what matters: time to first token, right there under the reply. That is wafer scale speed you can see, not just claim.",
  },
  {
    id: "scene-4",
    lang: "en",
    text:
      "Ask about the paper itself. Answers are grounded in the document, and follow ups stay in context. Ask deeper. Verify the source. Keep reading.",
  },
  {
    id: "scene-5-en",
    lang: "en",
    text:
      "Here is the differentiator. Explain this in simple Swahili. The answer streams in Swahili,",
  },
  {
    id: "scene-5-sw",
    lang: "sw",
    text:
      "na Read Any inakisoma kwa sauti ya Kiswahili halisi. Imejengwa kwa wasomaji ambao programu nyingi za A I huwasahau.",
  },
  {
    id: "scene-6",
    lang: "en",
    text:
      "The same reader you love on desktop, now in any browser, on any phone. Open source. Powered by Cerebras. Built on Read Any. Repository link below. Big chip energy.",
  },
];

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function synth(text, lang, outFile) {
  // Google TTS caps ~200 chars per request; split on sentence bounds and concat.
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 190) {
      chunks.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf(". ", 190);
    if (cut < 40) cut = remaining.lastIndexOf(" ", 190);
    if (cut < 40) cut = 190;
    chunks.push(remaining.slice(0, cut + 1));
    remaining = remaining.slice(cut + 1).trimStart();
  }
  const parts = [];
  for (const [i, chunk] of chunks.entries()) {
    const url =
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}` +
      `&q=${encodeURIComponent(chunk)}&total=${chunks.length}&idx=${i}&textlen=${chunk.length}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`TTS ${res.status} for "${chunk.slice(0, 40)}"`);
    const buf = Buffer.from(await res.arrayBuffer());
    const partFile = `${outFile}.part${i}.mp3`;
    fs.writeFileSync(partFile, buf);
    parts.push(partFile);
  }
  if (parts.length === 1) {
    fs.renameSync(parts[0], outFile);
  } else {
    const listFile = `${outFile}.list.txt`;
    fs.writeFileSync(listFile, parts.map((p) => `file '${p}'`).join("\n"));
    execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outFile], { stdio: "pipe" });
    for (const p of parts) fs.unlinkSync(p);
    fs.unlinkSync(listFile);
  }
  return outFile;
}

const durations = {};
for (const scene of SCENES) {
  const out = path.join(OUT, `${scene.id}.mp3`);
  await synth(scene.text, scene.lang, out);
  const dur = parseFloat(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out])
      .toString()
      .trim(),
  );
  durations[scene.id] = dur;
  console.log(`${scene.id}: ${dur.toFixed(2)}s (${scene.lang})`);
}
fs.writeFileSync(path.join(OUT, "durations.json"), JSON.stringify(durations, null, 2));
const total = Object.values(durations).reduce((a, b) => a + b, 0);
console.log(`TOTAL narration: ${total.toFixed(1)}s`);
