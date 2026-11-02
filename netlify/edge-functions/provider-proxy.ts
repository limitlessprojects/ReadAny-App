/**
 * Netlify Edge Function binding for the provider proxy.
 * Path bindings live in the in-file config below (no netlify.toml duplicate).
 *
 * Edge (not Lambda) functions were chosen because chat answers stream for
 * longer than the 10s sync Lambda ceiling; edge isolates stream SSE for the
 * full response duration.
 *
 * Key custody: GEMINI_API_KEY (and optionally CEREBRAS_API_KEY) are set in
 * Site configuration → Environment variables. Rotating a key = changing that
 * one env var. Nothing in the client bundle knows the key.
 */
// @ts-expect-error — Netlify global is injected by the edge runtime.
declare const Netlify: { env: { get(key: string): string | undefined } };

import { type ProxyEnv, handleProviderProxy } from "./lib/proxy-core.ts";

const netlifyEnv: ProxyEnv = {
  get: (key: string) => {
    try {
      return Netlify?.env?.get(key) ?? null;
    } catch {
      return null;
    }
  },
};

export default async (req: Request): Promise<Response> => handleProviderProxy(req, netlifyEnv);

export const config = {
  path: [
    "/gemini-api/*",
    "/cerebras-api/*",
    "/anthropic-api/*",
    "/openai-api/*",
    "/gtranslate-tts/*",
  ],
};
