# ReadAny Demo — Gemini (free tier) + Cerebras, phone-screen browser demo

**Branch:** `cerebras-demo` (fork of [codedogQBY/ReadAny](https://github.com/codedogQBY/ReadAny), GPL-3.0 preserved)
**What it is:** the full ReadAny reader running in a **plain browser** (no Tauri shell) with first-class **Gemini** and **Cerebras** providers, live **streaming speed instrumentation** (TTFT / tok·s badge), a **resilient TTS chain** (Gemini → Edge ↔ Google ↔ System) headlined by a native **Gemini TTS engine** (studio-grade neural voices on the free-tier key), **voice dictation** in chat, and **phone-first layouts** (full-screen chat sheet, slide-in sidebar drawer, responsive settings sheet).

Primary model path is **Google Gemini via its OpenAI-compatible endpoint** (`https://generativelanguage.googleapis.com/v1beta/openai`) — the free-tier key works from supported regions (Kenya is one; see [available regions](https://ai.google.dev/gemini-api/docs/available-regions)). Cerebras remains one env-var away for the competition variant.

---

## Run it (2 minutes)

```bash
# 1. deps
pnpm install

# 2. put your key in .env.demo.local (gitignored) — see .env.demo.local.example shape:
#    GEMINI_API_KEY=AQ.Ab8...   (or AIza...)
# 3. start the web build (also auto-starts the dev mock on :8787)
scripts/dev-web-ctl.sh start          # → http://127.0.0.1:5183
#    …or plain vite:
pnpm --filter app dev:web
```

Open `http://localhost:5183` → skip onboarding → **Add Book → Local Files** → pick a PDF/EPUB → open it → **Ask AI**.

On a fresh browser profile the app **auto-configures the Gemini endpoint** (`gemini-3.8-flash`) — no settings spelunking. The real key is injected **server-side** by the vite proxy (`GEMINI_API_KEY` env) and never enters the client bundle or localStorage.

### Auth surface (verified against docs)

| What | Value |
|---|---|
| Base URL | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| Auth | `Authorization: Bearer <GEMINI_API_KEY>` |
| Streaming | SSE, `stream: true` (measured by the TTFT badge) |
| Current models | `gemini-3.8-flash`, `gemini-3.5-flash` (verified live 2026-10-23; `gemini-3.8-flash-lite` / `gemini-3-pro` are 404) |
| Key format | `AIza...` (legacy) or `AQ.Ab8...` (2025+ format) — both accepted |
| Geo note | "User location is not supported" = egress region not in the allowlist (e.g. HK datacenter IPs). Kenya/Nigeria/EU/US are fine. |

### Switching between Gemini and Cerebras

```bash
# Gemini (default on this branch)
export GEMINI_API_TARGET=https://generativelanguage.googleapis.com
export GEMINI_API_KEY=AQ.Ab8...

# Cerebras (competition variant — needs a funded key)
export CEREBRAS_API_TARGET=https://api.cerebras.ai
export CEREBRAS_API_KEY=csk-...
```

In the app: **Settings → AI** → pick the provider endpoint + model (`gemini-3.8-flash` / `llama-3.3-70b`).

> Offline / geo-blocked dev: the default targets are the local `scripts/mock-llm-server.mjs` (Gemini-shaped OpenAI SSE mock, natural EN/Swahili replies) so the entire pipeline stays testable from anywhere. Set the real targets when you have connectivity.

---

## Deploy to Netlify (production demo, ~3 minutes)

The repo ships a full deploy kit: `netlify.toml`, an Edge Function provider proxy (`netlify/edge-functions/`), and `scripts/netlify-build.sh` (assembles landing page at `/` + the SPA under `/app/`).

1. Push this branch to GitHub and in Netlify: **Add site → Import an existing project → pick `limitlessprojects/ReadAny`** (branch `cerebras-demo`). Build command and publish dir come from `netlify.toml` — accept defaults.
2. Set ONE env var in Netlify: **`GEMINI_API_KEY`** (Site configuration →
   Environment variables, mark it Sensitive). The Edge Function resolves the
   demo key from the deploy environment only — the "proxy" placeholder
   credential the client sends is swapped server-side, so the key never ships
   in the JS bundle and never reaches the browser. (An earlier version fetched
   the key from a "secret gist" at runtime; that was removed after the gist
   URL turned out to be committed to this public repo — treat such URLs as
   public.) Optional: `CEREBRAS_API_KEY`, `*_API_TARGET` (mock/mirror
   endpoints) — see `netlify.toml` comments.

3. Deploy. Result:

   | Path | What |
   |---|---|
   | `/` | Mobile-first landing page (QR → `/app/`, install steps) |
   | `/app/` | The reader web app, installable as a PWA |
   | `/gemini-api/*` | Edge proxy → Gemini, key injected server-side |
   | `/cerebras-api/*` `/anthropic-api/*` `/openai-api/*` | BYOK passthrough proxies |

**Key custody & rotation (two layers):**
1. Deploy host: `GEMINI_API_KEY` env var in Netlify (Sensitive) — the only runtime source. **Rotate by updating the env var and redeploying.**
2. CI: the `GEMINI_API_KEY` **GitHub Actions secret** (used by the e2e workflow).
3. Local dev: gitignored `.env.demo.local`.

The plaintext key never appears in the repo, the client bundle, or localStorage. Use a free-tier demo key only, and restrict it by referrer in Google Cloud console if you can.

**Free tier first, BYOK below it:** visitors get the seeded Google Gemini endpoint out of the box (server key injected per-request; the client only ever holds a `"proxy"` placeholder credential). Adding your own key (Settings → AI → Add Endpoint: **Cerebras / Anthropic / OpenAI / Google Gemini / …**) overrides it for your session — BYOK keys are sent per-request through the same-origin proxy and are never persisted server-side. Deleting an endpoint is a two-tap confirm with an Undo toast, so the free tier can't be lost to a fat-finger.

Edge Functions were chosen over Lambda for the proxy because chat answers stream longer than the 10s sync-function ceiling; edge isolates stream SSE for the full response duration. Gemini also needs egress from a supported region — Netlify edge POPs (US/EU) qualify.

### Local production rehearsal

```bash
bash scripts/netlify-build.sh     # builds + assembles dist/ exactly like Netlify
node scripts/serve-dist.mjs       # → http://127.0.0.1:8788 (same proxy core, SPA fallbacks, .env)
```

Note: the vite build is memory-hungry (~4GB peak with esbuild sidecars). `scripts/netlify-build.sh` caps the V8 heap (`--max-old-space-size=1792`), disables per-chunk gzip size reporting and throttles rollup file ops — without those, 4GB CI boxes get OOM-killed (exit 137) during "rendering chunks". Close browser daemons before building locally.

---

## What this branch adds on top of upstream

| Piece | File | Notes |
|---|---|---|
| Web platform layer | `packages/app/src/lib/platform/*` | OPFS VFS, sql.js SQLite, full `IPlatformService`, Tauri shims — the whole app runs in a browser |
| Provider URL rewrite | `web-platform-service.ts` `rewriteProviderUrl` | Cerebras/Gemini/Google-TTS hosts → same-origin vite proxies |
| Provider proxies | `vite.config.ts` | `/gemini-api`, `/cerebras-api`, `/gtranslate-tts` + bearer-key injection from env |
| Demo auto-seed | `settings-store.ts` `seedWebDemoAIEndpointIfUntouched` | fresh profiles get a working Gemini endpoint automatically |
| Stream metrics | `packages/core/src/ai/stream-metrics.ts` | tees the SSE stream → **time-to-first-token** + tok/s, broadcast to the UI |
| Sleek speed badge | `components/chat/MessageList.tsx` | mono pill `⚡ 4ms · 95 tok/s` on the latest answer — metrics live in the tooltip, not the chat text |
| Resilient TTS chain | `stores/tts-store.ts` | engine fallback **Gemini → Edge ↔ Google ↔ System**, fires exactly once per failure |
| Gemini TTS engine | `packages/core/src/tts/gemini-tts.ts` | native `:generateContent` surface (`gemini-3.8-flash-lite-tts` default), 30 prebuilt voices, PCM/WAV decode, key injected server-side by the `/gemini-api` proxy — this is the "doesn't sound AI" engine |
| Google TTS engine | `packages/core/src/tts/google-translate-tts.ts` | keyless, works on any network, per-text language auto-detect (sw/zh/ja/ar/en) |
| Swahili auto-voice | core TTS + store | Swahili text → `sw-KE-RafikiNeural` (Edge) or `tl=sw` (Google) without manual picking |
| Edge TTS relay | `vite.config.ts` `edgeTtsRelayPlugin` | tunnels the Microsoft speech WebSocket with the required headers |
| Voice dictation | `components/chat/ChatInput.tsx` | guarded Web Speech API mic button (hidden when unsupported, `sw-KE` when UI language is Swahili) with surfaced error states (mic blocked / offline / no speech) |
| Full-screen chat sheet | `components/reader/ReaderView.tsx` | phone-width viewports get a full-screen chat overlay — the document keeps its width, no squeezed side-by-side |
| Mobile sidebar drawer | `layout/AppLayout.tsx` + `TabBar.tsx` | on phones the 192px desktop sidebar becomes a hamburger + slide-in drawer that auto-closes on navigation |
| Reader toolbar on phones | `components/reader/ReaderToolbar.tsx` | desktop-only controls (sync / PDF-zoom widget / pin / fullscreen) drop off at phone width so **Ask AI** is always on screen |
| Responsive settings sheet | `components/settings/SettingsDialog.tsx` | 800px desktop dialog becomes a full-screen sheet with a horizontal chip nav on phones |

**Desktop/Tauri build is untouched** — every web-only behavior is gated behind `READANY_WEB=1` (vite aliases) or `IS_WEB` runtime detection.

---

## Demo video pipeline (`scripts/demo/`)

| Script | Purpose |
|---|---|
| `narration.mjs` | per-scene voice-over (EN + Swahili segment), writes `durations.json` |
| `record-scenes.sh` / `rerecord-scenes.sh` / `scene2-only.sh` | 420×900 browser recordings of the golden-path scenes |
| `compose.py` | phone bezel → per-scene pad/trim to narration → mix → concat → closing overlay |

---

## Verified end-to-end (this branch)

- Boot: schema-ready before any store query, zero console errors; Gemini endpoint auto-seeded
- Import: file dialog → VFS → hash → library card with extracted title metadata
- Reader: foliate renders the PDF, page nav, TTS button; reader tour marks seen
- Chat: SSE streaming via the Gemini path, Markdown, thread history
- Speed badge: `⚡ TTFT · tok/s` measured on the real response stream
- TTS fallback: Edge failure (blocked WS) → onError → Google engine serves `tl=sw` audio (HTTP 200) → plays
- Swahili: streamed Swahili answer → read aloud with the right voice automatically
- Mobile: chat opens as a full-screen sheet; PDF keeps full width
- Dictation: mic button appears in Chromium, hidden where unsupported

## Known limitations (honest list)

- No vector DB on web (Rust-backed) — grounding uses the first-class BM25 path
- Library grid sometimes needs a refresh after an import on web (upstream virtualization quirk)
- Gemini calls from geo-blocked datacenter IPs fail ("User location is not supported") — the mock covers dev there
- Edge TTS synthesis is IP-sensitive in some datacenters; the Google engine covers that case automatically
- The mock server is for pipeline development only; it never labels itself inside the UI, but it only replies from a canned template

## Licence & attribution

- Upstream ReadAny: GPL-3.0 (© ReadAny Team) — this fork inherits it in full; no licence change.
- `sql.js` (vendored dependency): MIT — see `packages/app/src/lib/platform/vendor/LICENSE-sqljs.txt`.
- API key handling: server-side env injected by the dev proxy, or user-pasted at runtime in provider settings — never committed, never bundled.
