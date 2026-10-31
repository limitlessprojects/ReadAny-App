import "./polyfills";
import { i18nReady } from "@readany/core/i18n";
import { initI18nLanguage } from "@readany/core/i18n";
/**
 * Entry point — mount React app + beforeunload protection
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { setEmbeddingWorkerFactory, setStreamingFetch } from "@readany/core/ai";
import { onLibraryChanged } from "@readany/core/events/library-events";
import { installFeedbackLogCapture, setFeedbackWorkerUrl } from "@readany/core/feedback";
import {
  EmbeddingService,
  clearSearchConfiguration,
  configureSearch,
  createBuiltinEmbeddingService,
  normalizeEmbeddingEndpoint,
  setVectorDB,
} from "@readany/core/rag";
import { setPlatformService } from "@readany/core/services";
import { seedWebDemoAIEndpointIfUntouched } from "@readany/core/stores";
import { setTheme as setTauriTheme } from "@tauri-apps/api/app";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { shouldSuppressNativeContextMenu } from "./lib/environment";
import { TauriPlatformService } from "./lib/platform/tauri-platform-service";
import { WebPlatformService, webFetch } from "./lib/platform/web-platform-service";
import {
  registerDesktopFallbackContentProvider,
  registerWebFallbackContentProvider,
} from "./lib/rag/fallback-content-provider";
import { syncLegacyDesktopLibraryRootConfig } from "./lib/storage/desktop-library-root";
import { TauriVectorDB } from "./lib/tauri-vector-db";
import { useLibraryStore } from "./stores/library-store";
import { flushAllWrites } from "./stores/persist";
import { useVectorModelStore } from "./stores/vector-model-store";

installFeedbackLogCapture();

/**
 * Web build: run the full app in a plain browser (no Tauri shell).
 * Detected by the absence of Tauri IPC internals; the vite READANY_WEB=1
 * mode additionally aliases @tauri-apps/plugin-fs + plugin-dialog to
 * OPFS-backed shims so imports work end to end.
 */
const IS_WEB = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

// Suppress the WebView's native context menu in production builds; dev keeps
// it so the native menu (Inspect Element etc.) stays available for debugging.
// Editable areas get a slim custom menu (Undo/Cut/Copy/Paste/Select All) from
// the ContextMenu component; the reader's sandboxed iframe is handled
// separately in registerIframeEventHandlers. Without this, the OS/WebView2
// default menu (Inspect etc.) pops up over the app.
if (shouldSuppressNativeContextMenu) {
  document.addEventListener("contextmenu", (event) => event.preventDefault(), true);
}

// Keep the WebView color scheme in sync with the app theme so book CSS that
// relies on light-dark() / @media(prefers-color-scheme) follows the app theme
// instead of the OS scheme (e.g. sepia maps to a light scheme, so borders/text
// in light-mode colors stay visible instead of the OS dark-mode colors).
function syncSystemTheme() {
  if (IS_WEB) return; // browser handles prefers-color-scheme natively
  const theme = document.documentElement.getAttribute("data-theme");
  void setTauriTheme(theme === "dark" ? "dark" : "light").catch(() => {});
}
new MutationObserver(syncSystemTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});

const FEEDBACK_WORKER_FALLBACK = "https://feedback.readany.top";
const feedbackWorkerUrl =
  import.meta.env.VITE_FEEDBACK_WORKER_URL?.trim() || FEEDBACK_WORKER_FALLBACK;
setFeedbackWorkerUrl(feedbackWorkerUrl);

// Register platform service before any database/core operations
let webPlatform: WebPlatformService | null = null;
if (IS_WEB) {
  webPlatform = new WebPlatformService();
  setPlatformService(webPlatform);
  void webPlatform.init().catch(console.error);
  // Turnkey demo: point the AI config at Gemini (via /gemini-api proxy) when
  // the user hasn't configured any endpoint yet.
  void seedWebDemoAIEndpointIfUntouched().catch(console.error);
  // Web build: books live in the OPFS WebVFS — register the web variant so
  // fallback chapter tools (AI “read this chapter” etc.) work in the browser.
  registerWebFallbackContentProvider();
} else {
  const tauriPlatform = new TauriPlatformService();
  tauriPlatform.initSync().catch(console.error);
  setPlatformService(tauriPlatform);
  registerDesktopFallbackContentProvider();
}

// Streaming AI requests: Tauri native fetch (CORS-free) vs browser fetch
// (web build routes provider APIs through the dev-server proxy).
if (IS_WEB) {
  setStreamingFetch(webFetch);
} else {
  setStreamingFetch(tauriFetch as typeof globalThis.fetch);
}

// Register embedding worker factory for Vite/Tauri
// Must use `new URL(...)` + explicit `{ type: "module" }` so that
// import.meta.url is available inside the worker (needed by @huggingface/transformers / onnxruntime-web)
setEmbeddingWorkerFactory(
  () =>
    new Worker(new URL("@readany/core/ai/embedding-worker", import.meta.url), { type: "module" }),
);

/**
 * The vectorization pipeline configures its embedding source independently from
 * search. Keep the query-side service aligned with the active vector-model setting
 * so Reader Agent ragSearch can generate query embeddings as well.
 */
function configureRagSearchFromVectorModelStore(): void {
  const state = useVectorModelStore.getState();
  if (!state.vectorModelEnabled) {
    clearSearchConfiguration();
    return;
  }

  if (state.vectorModelMode === "builtin" && state.selectedBuiltinModelId) {
    configureSearch(createBuiltinEmbeddingService(state.selectedBuiltinModelId));
    return;
  }

  const remoteModel = state.getSelectedVectorModel();
  if (state.vectorModelMode === "remote" && remoteModel) {
    configureSearch(
      new EmbeddingService({
        model: {
          id: remoteModel.modelId,
          name: remoteModel.name || remoteModel.modelId,
          dimensions: remoteModel.dimension ?? 0,
          maxTokens: 8192,
          provider: "openai",
        },
        apiKey: remoteModel.apiKey || "local",
        baseUrl: remoteModel.url,
      }),
      {
        kind: "remote",
        modelId: remoteModel.modelId,
        endpoint: normalizeEmbeddingEndpoint(remoteModel.url),
        dimensions: remoteModel.dimension ?? 0,
      },
    );
    return;
  }

  clearSearchConfiguration();
}

configureRagSearchFromVectorModelStore();
useVectorModelStore.subscribe(configureRagSearchFromVectorModelStore);

// Set vector database reference (initialized in Rust setup)
// Web build: no vector DB (Rust-backed) — chat grounding degrades to the
// first-class BM25 inverted-index path.
if (IS_WEB) {
  console.log("[VectorDB] web build — using BM25-only grounding");
} else {
  const tauriVectorDB = new TauriVectorDB();
  setVectorDB(tauriVectorDB);
  console.log("[VectorDB] TauriVectorDB reference set");
}

// Desktop: resolve/configure the user library root. Web: nothing to resolve,
// but the schema MUST be created (initDatabase) before any store queries.
const dataRootReady: Promise<void> = IS_WEB
  ? (async () => {
      const { initDatabase } = await import("@readany/core/db");
      await initDatabase();
      console.log("[Web] database schema ready");
    })().catch((err) => {
      console.error("[Web] initDatabase failed:", err);
    })
  : syncLegacyDesktopLibraryRootConfig().catch(console.error);

// Ensure i18n is fully initialized before rendering
// (web also waits for the sql.js schema so store loaders never race it)
const renderReady: Promise<unknown> = IS_WEB ? Promise.all([i18nReady, dataRootReady]) : i18nReady;
renderReady.then(() => {
  dataRootReady.catch(console.error);

  // Restore saved theme from localStorage
  const savedTheme = localStorage.getItem("readany-theme");
  if (savedTheme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else if (savedTheme && ["light", "dark", "sepia"].includes(savedTheme)) {
    document.documentElement.setAttribute("data-theme", savedTheme);
  } else {
    // Default to sepia theme
    document.documentElement.setAttribute("data-theme", "sepia");
  }

  // Apply the restored theme to the WebView color scheme (observer above also
  // keeps it in sync on any later theme switch).
  syncSystemTheme();

  // Restore saved language from platform KV storage
  initI18nLanguage().catch(console.error);

  // Flush pending state writes before window closes
  window.addEventListener("beforeunload", () => {
    flushAllWrites();
    // Flush the sql.js debounce so the DB image survives the reload.
    void webPlatform?.flushAllDatabases();
  });

  // Initialize database and load books
  dataRootReady.then(() => {
    useLibraryStore.getState().loadBooks();
  });

  // Refresh library store when AI tools modify books/tags
  onLibraryChanged((deletedTags) => useLibraryStore.getState().loadBooks(deletedTags));

  // Fire-and-forget: preload foliate-js core modules so they're cached for later use
  import("foliate-js/view.js").catch(() => {});
  import("foliate-js/paginator.js").catch(() => {});

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
