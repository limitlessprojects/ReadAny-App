#!/usr/bin/env node
/**
 * Phase 1 spike: probe Edge TTS readaloud endpoint for Bookmark event support.
 *
 * Sends SSML containing `<bookmark mark="..."/>` elements and logs every text
 * frame received. The point is to answer one question:
 *
 *     Does the Edge readaloud server emit `Type: "Bookmark"` metadata events
 *     in response to `<bookmark mark="..."/>` SSML?
 *
 * If yes → Phase 1 of the foliate-tts migration is viable as designed.
 * If no  → we need a different mark-tracking strategy (e.g. WordBoundary +
 *          offset table) before Phase 2 onwards.
 *
 * This script is **standalone**: uses the `ws` package directly with the right
 * headers, bypassing IPlatformService. No production code paths involved.
 *
 * Run: node scripts/edge-tts-bookmark-spike.mjs
 */

// `ws` is a CommonJS module that exports the WebSocket class as default.
import WebSocket from "ws";
import crypto from "node:crypto";

// ── Constants (kept in sync with packages/core/src/tts/edge-tts.ts) ──
const EDGE_SPEECH_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const EDGE_API_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = "143";
const WIN_EPOCH_OFFSET = 11644473600n;
const S_TO_NS = 1000000000n;

// ── Token generation ──

async function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex").toUpperCase();
}

async function generateSecMsGec() {
  let ticks = BigInt(Math.floor(Date.now() / 1000));
  ticks += WIN_EPOCH_OFFSET;
  ticks -= ticks % 300n;
  ticks *= S_TO_NS / 100n;
  return sha256Hex(`${ticks.toString()}${EDGE_API_TOKEN}`);
}

function generateMuid() {
  return crypto.randomBytes(16).toString("hex").toUpperCase();
}

function randomHex(len) {
  return crypto.randomBytes(len).toString("hex");
}

// ── Test SSML variants ──

const SSML_VARIANTS = {
  /**
   * Baseline: plain text only. Same shape as production `genSSML`.
   * Used to confirm auth + WS + audio path works at all.
   */
  baseline: () =>
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="en-US-AriaNeural"><prosody rate="+0%" pitch="+0Hz">The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.</prosody></voice></speak>`,

  /** W3C SSML standard mark element. */
  w3cMark: () =>
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="en-US-AriaNeural"><prosody rate="+0%" pitch="+0Hz"><mark name="s0"/>The quick brown fox jumps over the lazy dog. <mark name="s1"/>Pack my box with five dozen liquor jugs. <mark name="s2"/>How vexingly quick daft zebras jump.</prosody></voice></speak>`,

  /** Microsoft `<bookmark>` extension (Azure docs syntax). */
  msBookmark: () =>
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="en-US-AriaNeural"><prosody rate="+0%" pitch="+0Hz"><bookmark mark="s0"/>The quick brown fox jumps over the lazy dog. <bookmark mark="s1"/>Pack my box with five dozen liquor jugs. <bookmark mark="s2"/>How vexingly quick daft zebras jump.</prosody></voice></speak>`,

  /** Microsoft `<bookmark>` with `mstts` namespace (alternative documented form). */
  mstssBookmark: () =>
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="en-US-AriaNeural"><prosody rate="+0%" pitch="+0Hz"><mstts:bookmark mark="s0"/>The quick brown fox jumps over the lazy dog. <mstts:bookmark mark="s1"/>Pack my box with five dozen liquor jugs. <mstts:bookmark mark="s2"/>How vexingly quick daft zebras jump.</prosody></voice></speak>`,
};

function genMessage(headers, content) {
  let header = "";
  for (const k of Object.keys(headers)) header += `${k}: ${headers[k]}\r\n`;
  return `${header}\r\n${content}`;
}

// ── Run one variant ──

async function runVariant(name, ssml) {
  const connectId = randomHex(16);
  const secMsGec = await generateSecMsGec();
  const params = new URLSearchParams({
    ConnectionId: connectId,
    TrustedClientToken: EDGE_API_TOKEN,
    "Sec-MS-GEC": secMsGec,
    "Sec-MS-GEC-Version": `1-${CHROMIUM_FULL_VERSION}`,
  });
  const url = `${EDGE_SPEECH_URL}?${params.toString()}`;

  const ws = new WebSocket(url, {
    headers: {
      "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "en-US,en;q=0.9",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      Cookie: `muid=${generateMuid()};`,
    },
  });

  const date = new Date().toString();

  const configMsg = genMessage(
    {
      "Content-Type": "application/json; charset=utf-8",
      Path: "speech.config",
      "X-Timestamp": date,
    },
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: true,
              wordBoundaryEnabled: true,
            },
            outputFormat: "audio-24khz-48kbitrate-mono-mp3",
          },
        },
      },
    }),
  );

  const ssmlMsg = genMessage(
    {
      "Content-Type": "application/ssml+xml",
      Path: "ssml",
      "X-RequestId": connectId,
      "X-Timestamp": date,
    },
    ssml,
  );

  return new Promise((resolve) => {
    let totalAudioBytes = 0;
    const observedPaths = new Map();
    const bookmarkEvents = [];
    const wordBoundaryEvents = [];
    const sentenceBoundaryEvents = [];
    const otherFrames = [];
    let closeCode;
    let closeReason;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {}
      resolve({
        name,
        totalAudioBytes,
        observedPaths,
        bookmarkEvents,
        wordBoundaryEvents,
        sentenceBoundaryEvents,
        otherFrames,
        closeCode,
        closeReason,
      });
    };

    ws.on("open", () => {
      ws.send(configMsg);
      ws.send(ssmlMsg);
    });

    ws.on("message", (data) => {
      // Edge TTS framing:
      //   - Text frames: HTTP-style "headers\r\n\r\nbody" (UTF-8).
      //   - Binary audio frames: 2-byte BE header length, then UTF-8 headers
      //     including `Path:audio`, then binary audio body.
      // We don't trust the ws-library `isBinary` flag (in practice all frames
      // arrive as Buffer here); instead we sniff the 2-byte length prefix.
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

      let isEdgeBinary = false;
      let headerText = "";
      let bodyBuf = null;

      if (buf.length >= 2) {
        const candidate = (buf[0] << 8) | buf[1];
        if (candidate > 0 && candidate <= buf.length - 2) {
          const slice = buf.slice(2, 2 + candidate).toString("utf-8");
          if (/Path:/i.test(slice)) {
            headerText = slice;
            bodyBuf = buf.slice(2 + candidate);
            isEdgeBinary = true;
          }
        }
      }

      if (!isEdgeBinary) {
        const raw = buf.toString("utf-8");
        const sep = raw.indexOf("\r\n\r\n");
        headerText = sep >= 0 ? raw.slice(0, sep) : raw;
        bodyBuf = sep >= 0 ? Buffer.from(raw.slice(sep + 4), "utf-8") : Buffer.alloc(0);
      }

      const pathLine = headerText.split("\r\n").find((l) => /^Path:/i.test(l));
      const path = pathLine ? pathLine.slice(pathLine.indexOf(":") + 1).trim() : "(none)";
      observedPaths.set(path, (observedPaths.get(path) ?? 0) + 1);

      if (isEdgeBinary && /^audio$/i.test(path)) {
        totalAudioBytes += bodyBuf.length;
      } else if (/^audio\.metadata$/i.test(path)) {
        try {
          const parsed = JSON.parse(bodyBuf.toString("utf-8"));
          for (const ev of parsed.Metadata ?? []) {
            const t = ev.Type;
            const offset = ev.Data?.Offset;
            if (t === "Bookmark") {
              bookmarkEvents.push({ name: ev.Data?.Name, offsetTicks: offset });
            } else if (t === "WordBoundary") {
              wordBoundaryEvents.push({ text: ev.Data?.text?.Text, offsetTicks: offset });
            } else if (t === "SentenceBoundary") {
              sentenceBoundaryEvents.push({ text: ev.Data?.text?.Text, offsetTicks: offset });
            }
          }
        } catch {}
      } else if (/^turn\.end$/i.test(path)) {
        finish();
      } else if (!/^turn\.start$|^response$/i.test(path)) {
        otherFrames.push({ path, body: bodyBuf.toString("utf-8").slice(0, 200) });
      }
    });

    ws.on("error", () => finish());
    ws.on("close", (code, reason) => {
      closeCode = code;
      closeReason = reason ? reason.toString() : "";
      finish();
    });

    setTimeout(finish, 15_000);
  });
}

function describeResult(r) {
  const paths = [...r.observedPaths.entries()]
    .map(([p, n]) => `${p}×${n}`)
    .join(", ");
  return [
    `── ${r.name} ──`,
    `audio bytes: ${r.totalAudioBytes}`,
    `frame paths: ${paths || "(none)"}`,
    `Bookmark events: ${r.bookmarkEvents.length}${r.bookmarkEvents.length ? "  " + r.bookmarkEvents.map((b) => `"${b.name}"@${(b.offsetTicks / 10_000).toFixed(0)}ms`).join(" ") : ""}`,
    `WordBoundary events: ${r.wordBoundaryEvents.length}`,
    `SentenceBoundary events: ${r.sentenceBoundaryEvents.length}`,
    r.otherFrames.length ? `other frames: ${r.otherFrames.map((f) => f.path).join(", ")}` : "",
    `close: code=${r.closeCode} reason=${r.closeReason || "(empty)"}`,
  ]
    .filter(Boolean)
    .join("\n  ");
}

// ── Main: run all variants and report ──

async function main() {
  const results = [];
  for (const [name, build] of Object.entries(SSML_VARIANTS)) {
    process.stdout.write(`Running ${name}…\n`);
    const r = await runVariant(name, build());
    results.push(r);
    process.stdout.write(`  ${describeResult(r).split("\n").join("\n  ")}\n\n`);
  }

  console.log("──────── VERDICT ────────");
  const baseline = results.find((r) => r.name === "baseline");
  const w3cMark = results.find((r) => r.name === "w3cMark");
  const msBookmark = results.find((r) => r.name === "msBookmark");
  const mstssBookmark = results.find((r) => r.name === "mstssBookmark");

  if (!baseline?.totalAudioBytes) {
    console.log("❌ Baseline failed — script/auth/WS issue, not a bookmark question.");
    return;
  }
  console.log("✅ Baseline works (auth + WS path OK).");

  for (const [label, r] of [
    ["W3C  <mark>          ", w3cMark],
    ["MS   <bookmark>      ", msBookmark],
    ["MS   <mstts:bookmark>", mstssBookmark],
  ]) {
    if (!r) continue;
    if (r.bookmarkEvents.length === 3 && r.totalAudioBytes > 0) {
      console.log(`✅ ${label}: 3/3 bookmark events received — VIABLE`);
    } else if (r.bookmarkEvents.length > 0) {
      console.log(
        `⚠️  ${label}: ${r.bookmarkEvents.length} events, ${r.totalAudioBytes}B audio — partial`,
      );
    } else if (r.totalAudioBytes > 0) {
      console.log(
        `⚠️  ${label}: audio plays but no bookmark events — server silently ignores tag`,
      );
    } else {
      console.log(`❌ ${label}: server rejected SSML (no audio, no events)`);
    }
  }
}

main().catch((err) => {
  console.error("[spike] fatal:", err);
  process.exit(1);
});
