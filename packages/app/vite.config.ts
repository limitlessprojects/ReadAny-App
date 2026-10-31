import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";

// @ts-expect-error vite config runs in CJS context
const require2 = createRequire(__filename);
// ws export shape varies by version (v7: root = WebSocket + .Server;
// v8: root = WebSocketServer + .WebSocket) — normalize both.
const wsRoot = require2("ws");
const UpstreamWS = wsRoot.WebSocket ?? wsRoot.default?.WebSocket ?? wsRoot;
const WebSocketServer = wsRoot.WebSocketServer ?? wsRoot.Server ?? wsRoot.default?.WebSocketServer;

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// Web build mode: alias @tauri-apps/plugin-fs + plugin-dialog to OPFS-backed
// shims (used with `pnpm --filter app dev:web`).
// @ts-expect-error process is a nodejs global
const WEB_SHIM = process.env.READANY_WEB === "1";
const pdfjsDist = path.resolve(__dirname, "../../node_modules/pdfjs-dist");

// Provider API proxies: browsers can't call these hosts cross-origin (and
// keys stay server-side when the corresponding *_API_KEY env is exported).
// Targets default to the local OpenAI-compatible mock server; set
// CEREBRAS_API_TARGET / GEMINI_API_TARGET to the real cloud endpoints.
// @ts-expect-error process is a nodejs global
const CEREBRAS_TARGET = process.env.CEREBRAS_API_TARGET || "http://127.0.0.1:8787";
// @ts-expect-error process is a nodejs global
const CEREBRAS_KEY = process.env.CEREBRAS_API_KEY || "";
// @ts-expect-error process is a nodejs global
const GEMINI_TARGET = process.env.GEMINI_API_TARGET || "http://127.0.0.1:8787";
// @ts-expect-error process is a nodejs global
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

/** The dev proxy injects the server-side key from the GEMINI_API_KEY env var
 *  (export it before `pnpm dev:web`). There is deliberately no remote fallback:
 *  an earlier version fetched the key from a "secret" gist at startup, but the
 *  gist URL was committed here — making it, and the key, public. */
// @ts-expect-error process is a nodejs global
const ANTHROPIC_TARGET = process.env.ANTHROPIC_API_TARGET || "https://api.anthropic.com";
// @ts-expect-error process is a nodejs global
const OPENAI_TARGET = process.env.OPENAI_API_TARGET || "https://api.openai.com";

/** The web demo auto-seeds endpoint apiKey with the literal "proxy" — a
 *  client-side placeholder meaning "the server holds the real key". Any such
 *  placeholder credential must be swapped for the server-side key, never
 *  forwarded upstream. Real (BYOK) keys pass through untouched. */
function isProxyPlaceholder(value: string | undefined | null): boolean {
  if (!value) return false;
  return (
    value
      .replace(/^Bearer /i, "")
      .trim()
      .toLowerCase() === "proxy"
  );
}

/** Rewrite `?key=proxy` in the proxied URL (the settings "test connection"
 *  flow builds native Gemini URLs with the key in the query string). */
function replaceProxyKeyQuery(urlPath: string, serverKey: string): string {
  if (!urlPath.includes("key=")) return urlPath;
  const url = new URL(urlPath, "http://proxy.local");
  if (isProxyPlaceholder(url.searchParams.get("key"))) {
    if (serverKey) url.searchParams.set("key", serverKey);
    else url.searchParams.delete("key");
  }
  return url.pathname + url.search;
}

/** Inject the server-side key when the client didn't send one — or sent the
 *  "proxy" placeholder (see isProxyPlaceholder). Bearer for OpenAI-compatible
 *  targets (Cerebras). Gemini is handled by injectGeminiAuthOnProxyReq below
 *  because its two credential families must never mix. */
function injectBearerOnProxyReq(key: string) {
  return (proxyReq: import("node:http").ClientRequest) => {
    if (!key) return;
    const auth = proxyReq.getHeader("authorization");
    const hasRealKey =
      typeof auth === "string" && auth.length > "Bearer ".length && !isProxyPlaceholder(auth);
    if (!hasRealKey) {
      proxyReq.setHeader("Authorization", `Bearer ${key}`);
    }
  };
}

/** Gemini credential routing — mixing families makes Google reject the call
 *  with "API keys are not supported by this API. Expected OAuth2…":
 *   - native v1beta surface (TTS, models list, generateContent)
 *       → x-goog-api-key header or ?key= query, NEVER Authorization
 *   - OpenAI-compat surface (/v1beta/openai/*)
 *       → Authorization: Bearer, never a stray x-goog header
 *  BYOK keys pass through; the "proxy" placeholder is swapped for the server
 *  key (identical semantics to the Netlify edge function). */
function injectGeminiAuthOnProxyReq(key: string) {
  return (proxyReq: import("node:http").ClientRequest) => {
    if (!key) return;
    const fullPath = proxyReq.path || "";
    const qIdx = fullPath.indexOf("?");
    const pathname = qIdx >= 0 ? fullPath.slice(0, qIdx) : fullPath;
    const query = new URLSearchParams(qIdx >= 0 ? fullPath.slice(qIdx + 1) : "");
    const nativeSurface = !pathname.includes("/openai/");
    const auth = proxyReq.getHeader("authorization");
    const goog = proxyReq.getHeader("x-goog-api-key");
    const realAuth =
      typeof auth === "string" && auth.length > "Bearer ".length && !isProxyPlaceholder(auth);
    const realGoog = typeof goog === "string" && goog.length > 0 && !isProxyPlaceholder(goog);
    if (nativeSurface) {
      if (query.has("key")) {
        // Auth via the (possibly swapped) query key: headers must not conflict.
        proxyReq.removeHeader("authorization");
        proxyReq.removeHeader("x-goog-api-key");
      } else if (realGoog) {
        proxyReq.removeHeader("authorization");
      } else if (realAuth) {
        // BYOK Bearer on the native surface — forward as-is.
      } else {
        proxyReq.removeHeader("authorization");
        proxyReq.setHeader("x-goog-api-key", key);
      }
    } else {
      if (realAuth) {
        if (!realGoog) proxyReq.removeHeader("x-goog-api-key");
      } else {
        proxyReq.setHeader("Authorization", `Bearer ${key}`);
        proxyReq.removeHeader("x-goog-api-key");
      }
    }
  };
}

/**
 * Edge TTS relay plugin — browsers can't open the Microsoft speech WebSocket
 * (the upgrade request needs specific Origin/UA headers the platform won't
 * send). The web build connects to ws://<dev>/edge-tts-relay/... and this
 * plugin tunnels the frames to wss://speech.platform.bing.com with the
 * headers Edge expects. Only active in READANY_WEB=1 mode.
 */
function edgeTtsRelayPlugin(): Plugin {
  const UPSTREAM = "wss://speech.platform.bing.com";
  const HEADERS = {
    Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
  };
  const wss = new WebSocketServer({ noServer: true });
  return {
    name: "edge-tts-relay",
    configureServer(server) {
      server.httpServer.on("upgrade", (req, socket, head) => {
        const url = req.url || "";
        if (!url.startsWith("/edge-tts-relay/")) return;
        const upstreamPath = url.replace("/edge-tts-relay", "");
        wss.handleUpgrade(req, socket, head, (client) => {
          let upstream: InstanceType<typeof UpstreamWS>;
          try {
            upstream = new UpstreamWS(UPSTREAM + upstreamPath, { headers: HEADERS });
          } catch (err) {
            client.close(1011, "relay connect failed");
            return;
          }
          const closeBoth = () => {
            try {
              client.close();
            } catch {
              /* already closed */
            }
            try {
              upstream.close();
            } catch {
              /* already closed */
            }
          };
          upstream.on("open", () => {
            client.on("message", (data) => {
              if (upstream.readyState === UpstreamWS.OPEN) upstream.send(data);
            });
            upstream.on("message", (data, isBinary) => {
              if (client.readyState === UpstreamWS.OPEN) {
                // ws message handler signature: (data, isBinary)
                client.send(data, { binary: isBinary });
              }
            });
          });
          upstream.on("error", closeBoth);
          client.on("error", closeBoth);
          upstream.on("close", (code, reason) => {
            try {
              client.close(code, reason);
            } catch {
              /* already closed */
            }
          });
          client.on("close", (code, reason) => {
            try {
              upstream.close(code, reason);
            } catch {
              /* already closed */
            }
          });
        });
      });
    },
  };
}

// The About dialog shows the Tauri framework version. @tauri-apps/api releases
// in lockstep but can differ by a patch, and its package.json is not importable
// (exports map), so read the version the app actually builds against from the
// lockfile. Empty string = the card renders without a version.
function readTauriVersion(): string {
  try {
    const lock = fs.readFileSync(path.resolve(__dirname, "src-tauri/Cargo.lock"), "utf-8");
    return lock.match(/^name = "tauri"\r?\nversion = "([^"]+)"/m)?.[1] ?? "";
  } catch {
    return "";
  }
}

// Same pattern for the TypeScript toolchain version: application source must
// not import a dev-only package's manifest for one field. Resolve through
// Node so hoisting cannot break the path.
function readTypeScriptVersion(): string {
  try {
    const require = createRequire(path.resolve(__dirname, "package.json"));
    return require("typescript/package.json").version ?? "";
  } catch {
    return "";
  }
}

// https://vite.dev/config/
export default defineConfig(() => {
  const RESOLVED_GEMINI_KEY = GEMINI_KEY;
  return ({
  define: {
    __TAURI_VERSION__: JSON.stringify(readTauriVersion()),
    __TS_VERSION__: JSON.stringify(readTypeScriptVersion()),
  },
  plugins: [react(), tailwindcss(), ...(WEB_SHIM ? [edgeTtsRelayPlugin()] : [])],
  worker: {
    format: "es",
  },
  resolve: {
    alias: {
      ...(WEB_SHIM
        ? {
            "@tauri-apps/plugin-fs": path.resolve(__dirname, "src/lib/platform/tauri-shim-fs.ts"),
            "@tauri-apps/plugin-dialog": path.resolve(
              __dirname,
              "src/lib/platform/tauri-shim-dialog.ts",
            ),
            "@tauri-apps/api/core": path.resolve(__dirname, "src/lib/platform/tauri-shim-core.ts"),
            "@tauri-apps/api/path": path.resolve(__dirname, "src/lib/platform/tauri-shim-path.ts"),
          }
        : {}),
      "@": path.resolve(__dirname, "./src"),
      "pdfjs-dist/build/pdf.worker.mjs": path.join(pdfjsDist, "build/pdf.worker.mjs"),
      "pdfjs-dist": pdfjsDist,
      // Map @pdfjs/* to foliate-js vendored pdfjs (v4.7, compatible with foliate-js)
      "@pdfjs": path.resolve(__dirname, "../../foliate-js/vendor/pdfjs"),
    },
    dedupe: ["i18next", "react-i18next", "react", "react-dom"],
  },
  optimizeDeps: {
    // Exclude foliate-js pdf.js from pre-bundling so that @pdfjs alias works
    exclude: [
      "foliate-js/pdf.js",
      // Tauri plugins import @tauri-apps/api/core internally; when the WEB_SHIM
      // alias redirects that specifier to a source file, esbuild dep scanning
      // fails. Serving them unbundled keeps per-request alias resolution.
      "@tauri-apps/api",
      "@tauri-apps/plugin-fs",
      "@tauri-apps/plugin-dialog",
      "@tauri-apps/plugin-http",
      "@tauri-apps/plugin-websocket",
      "@tauri-apps/plugin-clipboard-manager",
      "@tauri-apps/plugin-opener",
      "@tauri-apps/plugin-process",
      "@tauri-apps/plugin-updater",
      "@tauri-apps/plugin-window-state",
      "@tauri-apps/plugin-sql",
    ],
  },
  clearScreen: false,
  // Web deploys serve the SPA under /app/ so the repo root of the published
  // site can host the landing page. Desktop/Tauri builds keep "/".
  base: WEB_SHIM ? "/app/" : "/",
  build: {
    // reportCompressedSize gzip-compresses every chunk in memory just to
    // print sizes — on a ~6MB main chunk that is enough to OOM-kill the build
    // on 4GB boxes (exit 137 during "rendering chunks"). Sizes are noise here.
    reportCompressedSize: false,
    rollupOptions: {
      // Fewer concurrent file ops = lower transform-phase peak memory.
      maxParallelFileOps: 4,
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      "/cerebras-api": {
        target: CEREBRAS_TARGET,
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/cerebras-api/, ""),
        // Keep SSE streams unbuffered.
        headers: { "X-Accel-Buffering": "no" },
        configure: (proxy) => {
          proxy.on("proxyReq", injectBearerOnProxyReq(CEREBRAS_KEY));
        },
      },
      "/gemini-api": {
        target: GEMINI_TARGET,
        changeOrigin: true,
        rewrite: (p: string) => replaceProxyKeyQuery(p.replace(/^\/gemini-api/, ""), RESOLVED_GEMINI_KEY),
        // Keep SSE streams unbuffered.
        headers: { "X-Accel-Buffering": "no" },
        configure: (proxy) => {
          proxy.on("proxyReq", injectGeminiAuthOnProxyReq(RESOLVED_GEMINI_KEY));
        },
      },
      "/anthropic-api": {
        target: ANTHROPIC_TARGET,
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/anthropic-api/, ""),
        headers: { "X-Accel-Buffering": "no" },
        // BYOK-only: no server-held Anthropic key; x-api-key passes through.
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            // Anthropic rejects browser CORS preflights without this header;
            // through the proxy it must come from the server side.
            if (!proxyReq.getHeader("anthropic-dangerous-direct-browser-access")) {
              proxyReq.setHeader("anthropic-dangerous-direct-browser-access", "true");
            }
          });
        },
      },
      "/openai-api": {
        target: OPENAI_TARGET,
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/openai-api/, ""),
        headers: { "X-Accel-Buffering": "no" },
        // BYOK-only: no server-held OpenAI key; Authorization passes through.
      },
      "/gtranslate-tts": {
        target: "https://translate.google.com",
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/gtranslate-tts/, ""),
        headers: {
          // translate_tts rejects requests without a browser-ish UA.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
          Referer: "https://translate.google.com/",
        },
      },
    },
  },
  });
});
