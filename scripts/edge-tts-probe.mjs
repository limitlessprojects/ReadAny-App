#!/usr/bin/env node
/**
 * Node probe replicating the app's Edge TTS flow server-side, to debug the
 * relay's "closed without audio data". Prints every frame + close code.
 * Usage: node scripts/edge-tts-probe.mjs "hello world" [voice]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/home/z/my-project/ReadAny/package.json");
const WebSocket = require("ws");

const TEXT = process.argv[2] ?? "hello world";
const VOICE = process.argv[3] ?? "en-US-AriaNeural";
const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}
function genSecMsGec() {
  let ticks = BigInt(Math.floor(Date.now() / 1000));
  ticks += 11644473600n;
  ticks -= ticks % 300n;
  ticks *= 10000000n;
  return sha256Hex(`${ticks.toString()}${TOKEN}`);
}
function genMessage(headers, body) {
  return (
    Object.entries(headers)
      .map(([k, v]) => `${k}:${v}`)
      .join("\r\n") + "\r\n\r\n" + body
  );
}

const connectId = crypto.randomBytes(16).toString("hex");
const VARIANT = process.env.GEC_VARIANT ?? "none";
const params = new URLSearchParams({ ConnectionId: connectId, TrustedClientToken: TOKEN });
if (VARIANT !== "none") {
  params.set("Sec-MS-GEC", genSecMsGec());
  params.set("Sec-MS-GEC-Version", `1-${process.env.GEC_VERSION ?? "143.0.3650.75"}`);
}
const url =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?" + params.toString();

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "en-US,en;q=0.9",
  Pragma: "no-cache",
  "Cache-Control": "no-cache",
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  Cookie: `muid=${crypto.randomBytes(16).toString("hex").toUpperCase()};`,
};

const ws = new WebSocket(url, { headers });
let audioBytes = 0;
const date = new Date().toString();

const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${VOICE}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${TEXT}</prosody></voice></speak>`;

ws.on("open", () => {
  console.log("[probe] WS OPEN");
  ws.send(
    genMessage(
      { "Content-Type": "application/json; charset=utf-8", Path: "speech.config", "X-Timestamp": date },
      JSON.stringify({
        context: {
          synthesis: {
            audio: { metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: true }, outputFormat: "audio-24khz-48kbitrate-mono-mp3" },
          },
        },
      }),
    ),
  );
  ws.send(
    genMessage(
      { "Content-Type": "application/ssml+xml", Path: "ssml", "X-RequestId": connectId, "X-Timestamp": date },
      ssml,
    ),
  );
});

ws.on("message", (data, isBinary) => {
  if (isBinary) {
    audioBytes += data.length;
    return;
  }
  const text = data.toString();
  const pathMatch = text.match(/^Path:(.*)$/m);
  console.log("[probe] text frame Path:", pathMatch?.[1] ?? "?", "|", text.slice(0, 160).replace(/\r\n/g, " ¶ "));
  if (text.includes("Path:turn.end")) {
    console.log(`[probe] DONE audio bytes=${audioBytes}`);
    ws.close();
    process.exit(audioBytes > 0 ? 0 : 2);
  }
});

ws.on("close", (code, reason) => {
  console.log(`[probe] CLOSE code=${code} reason=${reason.toString()} audioBytes=${audioBytes}`);
  process.exit(audioBytes > 0 ? 0 : 2);
});
ws.on("error", (e) => {
  console.log("[probe] ERROR", e.message);
  process.exit(1);
});
setTimeout(() => { console.log("[probe] TIMEOUT"); process.exit(1); }, 15000);
