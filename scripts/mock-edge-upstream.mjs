#!/usr/bin/env node
/**
 * Mock Edge-TTS upstream for local testing (test-local-byok-tts.mjs T6b).
 *
 * Speaks just enough of the Microsoft Edge speech protocol to exercise the
 * /edge-tts-relay tunnel end to end: accepts the WS upgrade on
 * /consumer/speech/synthesize/readaloud/edge/v1, replies to the ssml message
 * with one binary "audio" frame followed by a Path:turn.end text frame.
 *
 * Usage: node scripts/mock-edge-upstream.mjs [--port 19112]
 */
import http from "node:http";
import { createRequire } from "node:module";

const require2 = createRequire(import.meta.url);
const wsRoot = require2("ws");
const WSS = wsRoot.WebSocketServer ?? wsRoot.Server ?? wsRoot.default?.WebSocketServer;

let PORT = 19112;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--port") PORT = Number(argv[++i]);
}

const server = http.createServer();
const wss = new WSS({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (!req.url || !req.url.startsWith("/consumer/speech/synthesize/readaloud/edge/v1")) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (client) => {
    client.on("message", (data) => {
      const msg = typeof data === "string" ? data : String(data);
      // The app's genMessage emits "Path: ssml" (space after colon) while the
      // canonical Edge client uses "Path:ssml" — accept both.
      if (/Path:\s*ssml/i.test(msg)) {
        client.send(Buffer.concat([Buffer.from("ID3\u0004"), Buffer.alloc(1200, 7)]), { binary: true });
        client.send("X-RequestId:mock\r\nContent-Type:application/json; charset=utf-8\r\nPath:turn.end\r\n\r\n{}");
      }
    });
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`[mock-edge-upstream] listening on 127.0.0.1:${PORT}`));
