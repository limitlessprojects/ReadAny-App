<div align="center">

# ReadAny

**Read anything, talk with your books.**

An AI-powered reader for EPUB and PDF — with grounded chat about what you're
reading, text-to-speech and translation. Runs on the web, on the desktop
(Windows · macOS · Linux) and on Android.

[![Release](https://img.shields.io/github/v/release/limitlessprojects/ReadAny-App?label=desktop&logo=github)](https://github.com/limitlessprojects/ReadAny-App/releases/latest)
[![Android APK](https://img.shields.io/badge/Android-latest%20APK-3DDC84?logo=android&logoColor=white)](https://github.com/limitlessprojects/ReadAny-App/releases/tag/readany-android)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

</div>

## Features

- **EPUB & PDF reading** on the vendored [foliate-js](https://github.com/johnfactotum/foliate-js) rendering engine
- **Grounded AI chat** — ask questions about the book you're reading, answers tied to the text
- **Bring your own key (BYOK)** — Gemini, Cerebras and OpenAI-compatible endpoints; requests go straight from your device to the provider, keys never leave it
- **Text-to-speech** that works out of the box, no key required
- **Translation** — DeepL, Microsoft or your own AI provider, with a growing list of target languages
- **WebDAV import** — pull your library from your own cloud storage
- **CLI** (`@readany/cli`) for scripted imports and maintenance tasks

## Repository layout

This is a pnpm monorepo (`pnpm@9.15.0`):

| Path | What it is |
| --- | --- |
| `packages/core` | Shared library — AI providers, i18n, TTS, translation |
| `packages/app` | Web app; desktop builds packaged with Tauri |
| `packages/app-expo` | Mobile app (Expo / React Native, Android today) |
| `packages/foliate-js` | Vendored EPUB rendering engine |
| `packages/cli` | `@readany/cli` |
| `packages/feedback-worker` | Feedback Cloudflare Worker |
| `landing` | Landing page |
| `website` | Docs website |
| `netlify` | Serverless backend (functions + edge functions) |

## Getting started

```bash
git clone https://github.com/limitlessprojects/ReadAny-App.git
cd ReadAny-App
corepack enable && pnpm install
pnpm dev        # web app
```

Common scripts:

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` | Run / build the web app |
| `pnpm test` / `pnpm lint` | Core test suite / Biome checks |
| `pnpm expo:start` | Start the Expo dev server |
| `pnpm eas:build:android` | Build the Android APK via EAS |
| `pnpm tauri` | Desktop (Tauri) build tooling |
| `pnpm cli` | Run the CLI in dev mode |

## Downloads

- **Android** — latest APK from the rolling
  [`readany-android`](https://github.com/limitlessprojects/ReadAny-App/releases/tag/readany-android) release
- **Desktop** — Windows, macOS and Linux builds from the
  [latest release](https://github.com/limitlessprojects/ReadAny-App/releases/latest)

## Changelog

- **2026-11-02** — documentation refresh
- **2026-10-24** — desktop release v1.3.7 (Windows, macOS, Linux) and rolling Android APK channel

## License

[GPL-3.0](LICENSE) — see [LICENSE](LICENSE) for details.
