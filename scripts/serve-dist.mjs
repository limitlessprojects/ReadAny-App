#!/usr/bin/env node
/**
 * Local production simulator — rehearses the exact Netlify topology:
 *
 *   /               → landing page
 *   /app/<file>     → static SPA files from dist/app/
 *   /app/<anything> → SPA fallback to dist/app/index.html
 *   /gemini-api/*   → provider proxy (same code as the edge function)
 *   /cerebras-api/*, /anthropic-api/*, /openai-api/*, /gtranslate-tts/*
 *
 * Env comes from the repo-root .env (GEMINI_API_KEY + *_API_TARGET overrides)
 * — identical key-custody semantics to Netlify env vars.
 *
 * Usage: node scripts/serve-dist.mjs [--port 8788] [--dist dist]
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { createRequire } from "node:module";
import { handleProviderProxy } from "../netlify/edge-functions/lib/proxy-core.ts";

// 'ws' ships with vite's dependency tree — the same import style vite.config.ts
// uses (v7 root = WebSocket + .Server; v8 = WebSocketServer + .WebSocket).
const require2 = createRequire(import.meta.url);
const wsRoot = require2("ws");
const UpstreamWS = wsRoot.WebSocket ?? wsRoot.default?.WebSocket ?? wsRoot;
const WebSocketServer = wsRoot.WebSocketServer ?? wsRoot.Server ?? wsRoot.default?.WebSocketServer;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---- args ----
let PORT = 8788;
let DIST = path.join(ROOT, "dist");
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--port") PORT = Number(argv[++i]);
  if (argv[i] === "--dist") DIST = path.resolve(argv[++i]);
}
if (!existsSync(path.join(DIST, "app", "index.html"))) {
  console.error(`[serve-dist] missing ${path.join(DIST, "app", "index.html")} — run scripts/netlify-build.sh first`);
  process.exit(1);
}

// ---- env (repo-root .env, same contract as Netlify env vars) ----
const envMap = new Map();
for (const [k, v] of Object.entries(process.env)) {
  if (v !== undefined) envMap.set(k, v);
}
const envFile = path.join(ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !envMap.has(m[1])) envMap.set(m[1], m[2]);
  }
}
const envAdapter = { get: (k) => envMap.get(k) ?? null };

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

const PROXY_PREFIXES = ["/gemini-api", "/cerebras-api", "/anthropic-api", "/openai-api", "/gtranslate-tts"];

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const pathname = decodeURIComponent(url.pathname);

    if (PROXY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) headers.set(k, v.join(", "));
        else if (typeof v === "string") headers.set(k, v);
      }
      const hasBody = !["GET", "HEAD"].includes(req.method);
      const bodyBuf = hasBody ? await readBody(req) : undefined;
      const proxied = new Request(`http://127.0.0.1:${PORT}${req.url}`, {
        method: req.method,
        headers,
        body: bodyBuf,
      });
      const proxiedRes = await handleProviderProxy(proxied, envAdapter);
      res.writeHead(proxiedRes.status, Object.fromEntries(proxiedRes.headers));
      if (proxiedRes.body) {
        Readable.fromWeb(proxiedRes.body).pipe(res);
      } else {
        res.end();
      }
      return;
    }

    // Static with SPA fallback — mirrors the netlify.toml redirects.
    const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const candidate = path.join(DIST, safePath);
    let filePath = null;
    if (candidate.startsWith(DIST)) {
      try {
        const s = await stat(candidate);
        if (s.isFile()) filePath = candidate;
        else if (s.isDirectory()) {
          const idx = path.join(candidate, "index.html");
          if (existsSync(idx)) filePath = idx;
        }
      } catch {
        /* not found — fall through */
      }
    }
    if (!filePath) {
      filePath = pathname === "/app" || pathname.startsWith("/app/")
        ? path.join(DIST, "app", "index.html")
        : path.join(DIST, "index.html");
    }

    const ext = path.extname(filePath).toLowerCase();
    const isAsset = filePath.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "cache-control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("[serve-dist]", err);
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("internal error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[serve-dist] http://127.0.0.1:${PORT}/  (landing)  /app/  (web app)`);
  console.log(`[serve-dist] GEMINI_API_KEY ${envAdapter.get("GEMINI_API_KEY") ? "loaded" : "MISSING"} from .env / environment`);
});

// ---- Edge TTS relay ----
// Browsers cannot open the Microsoft speech WebSocket (the upgrade request
// needs Origin/UA headers the platform will not send), so the web app connects
// to ws://<host>/edge-tts-relay/... and this tunnel forwards frames to
// wss://speech.platform.bing.com with the headers Edge expects — identical to
// the vite dev plugin, so Edge TTS works in the local PRODUCTION build too.
const EDGE_UPSTREAM = process.env.EDGE_TTS_UPSTREAM || "wss://speech.platform.bing.com";
const EDGE_HEADERS = {
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
};
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = req.url || "";
  if (!url.startsWith("/edge-tts-relay/")) return;
  const upstreamPath = url.replace("/edge-tts-relay", "");
  wss.handleUpgrade(req, socket, head, (client) => {
    let upstream;
    try {
      upstream = new UpstreamWS(EDGE_UPSTREAM + upstreamPath, { headers: EDGE_HEADERS });
    } catch {
      client.close(1011, "relay connect failed");
      return;
    }
    const closeBoth = () => {
      try { client.close(); } catch { /* already closed */ }
      try { upstream.close(); } catch { /* already closed */ }
    };
    // Buffer client frames until the upstream is open. The app client sends
    // speech.config + ssml immediately after ITS open fires (which happens at
    // upgrade time), so frames can arrive before the upstream handshake
    // completes — attaching the handler only inside upstream "open" would
    // silently drop them (synthesis then hangs with no audio).
    const pendingFromClient = [];
    client.on("message", (data) => {
      if (upstream.readyState === UpstreamWS.OPEN) upstream.send(data);
      else pendingFromClient.push(data);
    });
    upstream.on("open", () => {
      while (pendingFromClient.length) upstream.send(pendingFromClient.shift());
      upstream.on("message", (data, isBinary) => {
        // ws v7 has no isBinary param — binary frames arrive as Buffer. Forward
        // with an EXPLICIT binary flag: with ws v7, `{binary: undefined}` sends
        // the frame as TEXT, and the browser client would then drop the audio.
        const isBin = typeof isBinary === "boolean" ? isBinary : data instanceof Buffer;
        if (client.readyState === UpstreamWS.OPEN) client.send(data, { binary: isBin });
      });
    });
    upstream.on("error", closeBoth);
    client.on("error", closeBoth);
    upstream.on("close", (code, reason) => {
      try { client.close(code, reason); } catch { /* already closed */ }
    });
    client.on("close", (code, reason) => {
      try { upstream.close(code, reason); } catch { /* already closed */ }
    });
  });
});
