/**
 * Provider proxy — the production twin of the vite dev proxies.
 *
 * The web app calls same-origin paths (/gemini-api/*, /cerebras-api/*, …);
 * this function forwards them to the real provider hosts. It exists for two
 * reasons:
 *   1. CORS — browsers can't call these hosts cross-origin.
 *   2. Key custody — the demo's free-tier key lives in server env vars
 *      (GEMINI_API_KEY / CEREBRAS_API_KEY) and NEVER ships to the client.
 *
 * BYOK: a user-supplied key passes through untouched. The client's seeded
 * placeholder credential (the literal string "proxy") is swapped for the
 * server-held key — identical semantics to the vite dev proxies.
 *
 * Runtime-agnostic on purpose: no Netlify/Deno-specific imports here, so the
 * local production simulator (scripts/serve-dist.mjs) runs the same code.
 */

export type ProxyEnv = { get(key: string): string | null | undefined };

/**
 * Key custody: the demo key comes from server env vars ONLY.
 *
 * An earlier design fetched the key from a "secret" gist at runtime; the gist
 * URL shipped in this public repo (and in git history), which made the URL —
 * and therefore the key — public. That mechanism was removed: set GEMINI_API_KEY
 * in the deploy host's environment (Netlify → Site configuration → Environment
 * variables) and redeploy. Rotating a key is now an env-var edit + redeploy.
 */
const GEMINI_DEMO_ALLOWED_PATH =
  /^\/(v1beta\/openai\/(chat\/completions|models(\/[\w.-]+)?)|v1beta\/models(\/[\w.-]+(:(streamGenerateContent|generateContent))?)?)\/?$/;

/** Env-var-only key resolution (no network, no cache — cannot silently
 *  fall back to a stale leaked key). */
function resolveServerKey(env: ProxyEnv, keyEnv: string | undefined): string {
  if (!keyEnv) return "";
  return env.get(keyEnv) || "";
}

interface TargetConfig {
  host: string;
  keyEnv?: string;
  extraHeaders?: Record<string, string>;
}

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

/** The env target overrides exist so a fork can point the proxy at a mock or
 *  a regional mirror without code changes — same contract as vite dev. */
function buildTargets(env: ProxyEnv): Record<string, TargetConfig> {
  return {
    gemini: {
      host: env.get("GEMINI_API_TARGET") || "https://generativelanguage.googleapis.com",
      keyEnv: "GEMINI_API_KEY",
    },
    cerebras: {
      host: env.get("CEREBRAS_API_TARGET") || "https://api.cerebras.ai",
      keyEnv: "CEREBRAS_API_KEY",
    },
    anthropic: {
      host: env.get("ANTHROPIC_API_TARGET") || "https://api.anthropic.com",
      extraHeaders: { "anthropic-dangerous-direct-browser-access": "true" },
    },
    openai: {
      host: env.get("OPENAI_API_TARGET") || "https://api.openai.com",
    },
    gtranslate: {
      host: "https://translate.google.com",
      extraHeaders: { "User-Agent": DEFAULT_UA, Referer: "https://translate.google.com/" },
    },
  };
}

const PATH_PREFIXES: Record<string, string> = {
  "/gemini-api": "gemini",
  "/cerebras-api": "cerebras",
  "/anthropic-api": "anthropic",
  "/openai-api": "openai",
  "/gtranslate-tts": "gtranslate",
};

/** Client headers worth forwarding upstream. Everything else (cookies,
 *  forwarded-for chains, netlify traces) stays on our side. */
const FORWARDED_HEADERS = [
  "authorization",
  "x-goog-api-key",
  "x-api-key",
  "anthropic-version",
  "content-type",
  "accept",
  "accept-language",
];

const RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "cache-control",
  "retry-after",
  "x-request-id",
];

/** The seeded demo credential meaning "the server holds the real key". */
function isProxyPlaceholder(value: string | null | undefined): boolean {
  if (!value) return false;
  return (
    value
      .replace(/^Bearer /i, "")
      .trim()
      .toLowerCase() === "proxy"
  );
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleProviderProxy(req: Request, env: ProxyEnv): Promise<Response> {
  const url = new URL(req.url);
  let prefix = "";
  for (const candidate of Object.keys(PATH_PREFIXES)) {
    if (url.pathname === candidate || url.pathname.startsWith(`${candidate}/`)) {
      prefix = candidate;
      break;
    }
  }
  if (!prefix) {
    return jsonError(`provider proxy: no target for path ${url.pathname}`, 404);
  }
  const targets = buildTargets(env);
  const target = targets[PATH_PREFIXES[prefix]];
  if (!target) {
    return jsonError(`provider proxy: unknown target ${PATH_PREFIXES[prefix]}`, 500);
  }

  let upstreamPath = url.pathname.slice(prefix.length) || "/";
  const query = new URLSearchParams(url.search);

  // Diagnostic: GET /gemini-api/__health → which key source works and whether
  // Google accepts it. Never returns the key itself.
  if (PATH_PREFIXES[prefix] === "gemini" && upstreamPath === "/__health") {
    const key = resolveServerKey(env, "GEMINI_API_KEY");
    let upstreamStatus: number | string = "skipped (no key)";
    if (key) {
      try {
        const r = await fetch(`${target.host.replace(/\/$/, "")}/v1beta/models?pageSize=1`, {
          headers: { "x-goog-api-key": key },
          signal: AbortSignal.timeout(5000),
        });
        upstreamStatus = r.status;
      } catch (err) {
        upstreamStatus = `fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    return new Response(
      JSON.stringify({ keyLoaded: Boolean(key), googleModelsStatus: upstreamStatus }),
      {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      },
    );
  }

  // OpenAI-compat compatibility shim: clients that speak the standard
  // /v1/chat/completions dialect (e.g. the Android APK, OpenAI SDKs pointed
  // at https://<site>/gemini-api) get transparently mapped onto Gemini's
  // OpenAI-compatible surface at /v1beta/openai/*. Native v1beta paths
  // (TTS, models list, generateContent) pass through untouched.
  if (PATH_PREFIXES[prefix] === "gemini" && upstreamPath.startsWith("/v1/")) {
    upstreamPath = "/v1beta/openai/" + upstreamPath.slice("/v1/".length);
  }

  // Settings "test connection" builds native Gemini URLs with ?key=<key>;
  // swap the placeholder for the server key there too.
  //
  // ENV-FIRST: the demo key comes from the deploy host's env (GEMINI_API_KEY)
  // or from the client's own BYOK credential. There is no third source — the
  // old runtime gist broker leaked its URL in this public repo and was removed.
  const serverKey = resolveServerKey(env, target.keyEnv);
  const keySource = serverKey ? "env" : "none";
  if (isProxyPlaceholder(query.get("key"))) {
    if (serverKey) query.set("key", serverKey);
    else query.delete("key");
  }
  const search = query.toString();
  const upstream = target.host.replace(/\/$/, "") + upstreamPath + (search ? `?${search}` : "");

  const headers = new Headers();
  const clientAuth = req.headers.get("authorization");
  const clientGoog = req.headers.get("x-goog-api-key");
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  // BYOK passes through. Missing/placeholder credentials get the server key —
  // with one subtlety that cost a 401 to learn: Google rejects requests that
  // carry BOTH an API-key credential and an Authorization header ("API keys
  // are not supported… Expected OAuth2"). So the credential families must
  // never mix:
  //   native v1beta (TTS, models list, generateContent) → x-goog-api-key / ?key=
  //   OpenAI-compat (/v1beta/openai/*)                  → Authorization: Bearer
  const clientRealAuth = Boolean(clientAuth) && !isProxyPlaceholder(clientAuth);
  const clientRealGoog = Boolean(clientGoog) && !isProxyPlaceholder(clientGoog);
  if (serverKey && PATH_PREFIXES[prefix] === "gemini") {
    const nativeSurface = !upstreamPath.includes("/openai/");
    if (nativeSurface) {
      if (query.has("key")) {
        // Auth via the (possibly swapped) query key: headers must not conflict.
        headers.delete("authorization");
        headers.delete("x-goog-api-key");
      } else if (clientRealGoog) {
        headers.delete("authorization");
      } else if (clientRealAuth) {
        // BYOK Bearer on the native surface — forward as-is.
      } else {
        headers.delete("authorization");
        headers.set("x-goog-api-key", serverKey);
      }
    } else {
      // OpenAI-compat surface: Bearer only; a stale/placeholder goog header
      // would only risk confusion, drop it.
      if (clientRealAuth) {
        if (!clientRealGoog) headers.delete("x-goog-api-key");
      } else {
        headers.set("authorization", `Bearer ${serverKey}`);
        headers.delete("x-goog-api-key");
      }
    }
  } else if (serverKey) {
    // cerebras-style targets: Bearer only.
    if (!clientRealAuth) headers.set("authorization", `Bearer ${serverKey}`);
  }
  // Fail fast when there is nothing to authenticate with — forwarding the
  // literal "proxy" placeholder (or an empty credential) to Google only
  // produces an opaque 400 that looks like a broken BYOK key.
  const realQueryKey = query.has("key") && !isProxyPlaceholder(query.get("key"));
  if (
    !serverKey &&
    !clientRealAuth &&
    !clientRealGoog &&
    !realQueryKey &&
    PATH_PREFIXES[prefix] === "gemini"
  ) {
    return jsonError(
      "demo AI is temporarily unavailable: the server demo key could not be loaded. BYOK still works — add your own key in Settings → AI.",
      503,
    );
  }
  // The shared demo key may only reach chat, model-list and generateContent
  // (TTS) endpoints. Without this, anyone could spend it on file uploads,
  // cached contents, tuning or batch jobs through this proxy.
  if (
    PATH_PREFIXES[prefix] === "gemini" &&
    serverKey &&
    !clientRealAuth &&
    !clientRealGoog &&
    !realQueryKey
  ) {
    if (!GEMINI_DEMO_ALLOWED_PATH.test(upstreamPath)) {
      return jsonError(
        `demo AI: ${upstreamPath} is not available on the shared demo key (BYOK has no such limit)`,
        403,
      );
    }
  }
  if (target.extraHeaders) {
    for (const [name, value] of Object.entries(target.extraHeaders)) {
      if (!headers.get(name)) headers.set(name, value);
    }
  }

  const hasBody = !["GET", "HEAD"].includes(req.method);
  let body: BodyInit | undefined;
  if (hasBody) {
    // Chat payloads are small JSON; buffering keeps the fetch simple and
    // avoids duplex-stream quirks across runtimes. SSE responses still
    // stream out because we return the upstream body unbuffered below.
    body = await req.arrayBuffer();
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, {
      method: req.method,
      headers,
      body,
      // Chat API redirects should surface, not silently re-auth elsewhere.
      redirect: "follow",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(`provider proxy: upstream fetch failed: ${message}`, 502);
  }

  const resHeaders = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstreamRes.headers.get(name);
    if (value !== null) resHeaders.set(name, value);
  }
  // Diagnostic: which credential the proxy attached ("env" | "none").
  resHeaders.set("x-demo-key-source", keySource);
  // SSE/text streams must not be buffered by the CDN.
  const contentType = upstreamRes.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    resHeaders.set("x-accel-buffering", "no");
  }
  // Error responses with an empty body make clients print "503 status code
  // (no body)". Give them something readable instead.
  if (upstreamRes.status >= 400) {
    const errText = await upstreamRes.text();
    if (!errText.trim()) {
      resHeaders.set("content-type", "application/json");
      return new Response(
        JSON.stringify({
          error: {
            message: `${PATH_PREFIXES[prefix]} upstream returned HTTP ${upstreamRes.status} with an empty body (usually overload or quota) — retry in a moment, or add your own key in Settings → AI.`,
          },
        }),
        { status: upstreamRes.status, headers: resHeaders },
      );
    }
    return new Response(errText, { status: upstreamRes.status, headers: resHeaders });
  }
  return new Response(upstreamRes.body, { status: upstreamRes.status, headers: resHeaders });
}
