/**
 * WebPlatformService — IPlatformService implementation for the browser build.
 *
 * Pairs with:
 *  - WebVFS (OPFS-backed virtual filesystem)
 *  - WebDatabase (vendored sql.js SQLite in WASM)
 *
 * The rest of the app (library store, reader, chat, TTS, i18n) talks to this
 * through the same IPlatformService seam the Tauri desktop build uses.
 */
import type {
  FetchOptions,
  FilePickerOptions,
  IDatabase,
  IPlatformService,
  IWebSocket,
  WebSocketOptions,
} from "@readany/core/services";
import { WebDatabase } from "./web-database";
import {
  requestPersistentStorage,
  vfsCachedObjectURL,
  vfsCopyFile,
  vfsDeleteFile,
  vfsExists,
  vfsMkdir,
  vfsObjectURL,
  vfsReadDir,
  vfsReadFile,
  vfsReadTextFile,
  vfsStat,
  vfsWriteFile,
  vfsWriteTextFile,
  warmObjectUrls,
} from "./web-vfs";

const DATA_ROOT = "/data";
const IMPORT_DIR = "/imports";

/**
 * Rewrite provider API URLs onto the dev-server proxy path. Browsers can't
 * call these hosts cross-origin, and routing through the vite proxy keeps
 * API keys server-side (CEREBRAS_API_KEY / GEMINI_API_KEY env) or at least
 * same-origin:
 *  - api.cerebras.ai                    → /cerebras-api  (Cerebras cloud)
 *  - generativelanguage.googleapis.com  → /gemini-api    (Gemini, OpenAI-compat)
 *  - translate.google.com               → /gtranslate-tts (Google TTS fallback)
 */
const PROVIDER_PROXY_HOSTS: Record<string, string> = {
  "api.cerebras.ai": "/cerebras-api",
  "generativelanguage.googleapis.com": "/gemini-api",
  "translate.google.com": "/gtranslate-tts",
  // BYOK providers — same-origin proxy avoids CORS preflight failures and
  // keeps the app's fetch surface uniform across all providers.
  "api.anthropic.com": "/anthropic-api",
  "api.openai.com": "/openai-api",
};

export function rewriteProviderUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    const prefix = PROVIDER_PROXY_HOSTS[parsed.hostname];
    if (prefix) {
      return prefix + parsed.pathname + parsed.search;
    }
    return url;
  } catch {
    return url;
  }
}

/** Back-compat alias — the Cerebras rewrite was generalized to all providers. */
export const rewriteCerebrasUrl = rewriteProviderUrl;

/** Browser fetch with provider-proxy rewriting — used as streaming fetch. */
export const webFetch: typeof globalThis.fetch = ((
  input: RequestInfo | URL,
  init?: RequestInit,
) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const rewritten = rewriteProviderUrl(url);
  if (rewritten !== url) {
    return globalThis.fetch(rewritten, init);
  }
  return globalThis.fetch(input as RequestInfo, init);
}) as typeof globalThis.fetch;

function posixJoin(...parts: string[]): string {
  const joined = parts
    .filter((p) => p !== undefined && p !== null && p !== "")
    .map((p) => String(p).replace(/\\/g, "/"))
    .join("/");
  return joined.replace(/\/{2,}/g, "/");
}

async function stashPickedFiles(files: File[]): Promise<string[]> {
  await vfsMkdir(IMPORT_DIR);
  const used = new Set<string>();
  const paths: string[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[/\\]/g, "_") || "import.bin";
    let candidate = `${IMPORT_DIR}/${safeName}`;
    let n = 2;
    while (used.has(candidate) || (await vfsExists(candidate))) {
      const dot = safeName.lastIndexOf(".");
      const stem = dot > 0 ? safeName.slice(0, dot) : safeName;
      const ext = dot > 0 ? safeName.slice(dot) : "";
      candidate = `${IMPORT_DIR}/${stem}-${n}${ext}`;
      n += 1;
    }
    used.add(candidate);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await vfsWriteFile(candidate, bytes);
    paths.push(candidate);
  }
  return paths;
}

export class WebPlatformService implements IPlatformService {
  readonly platformType = "web" as const;
  readonly isMobile = false;
  readonly isDesktop = false;

  private dbInstances = new Map<string, Promise<WebDatabase>>();

  /** Called once from main.tsx after registration. */
  async init(): Promise<void> {
    await requestPersistentStorage();
    await vfsMkdir(DATA_ROOT);
    await vfsMkdir(IMPORT_DIR);
    // Re-warm blob URLs for covers/fonts after a page reload.
    await warmObjectUrls();
  }

  // ---- File system ----

  readFile(path: string): Promise<Uint8Array> {
    return vfsReadFile(path);
  }

  writeFile(path: string, data: Uint8Array): Promise<void> {
    return vfsWriteFile(path, data);
  }

  writeTextFile(path: string, content: string): Promise<void> {
    return vfsWriteTextFile(path, content);
  }

  readTextFile(path: string): Promise<string> {
    return vfsReadTextFile(path);
  }

  async mkdir(path: string): Promise<void> {
    await vfsMkdir(path);
  }

  exists(path: string): Promise<boolean> {
    return vfsExists(path);
  }

  deleteFile(path: string): Promise<void> {
    return vfsDeleteFile(path);
  }

  async getAppDataDir(): Promise<string> {
    return DATA_ROOT;
  }

  async getDataDir(): Promise<string> {
    return DATA_ROOT;
  }

  async joinPath(...parts: string[]): Promise<string> {
    return posixJoin(...parts);
  }

  /**
   * Web stand-in for Tauri's asset protocol: returns a blob: URL for files
   * whose object URL has been warmed (covers, fonts, DB-adjacent assets).
   * Reader code paths fall back to readFile() when the URL is unusable.
   */
  convertFileSrc(path: string): string {
    return vfsCachedObjectURL(path);
  }

  // ---- File picker ----

  async pickFile(options?: FilePickerOptions): Promise<string | string[] | null> {
    const picked = await this.openFilePicker(options);
    return picked;
  }

  private openFilePicker(options?: FilePickerOptions): Promise<string | string[] | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.id = "readany-web-file-picker";
      input.style.position = "fixed";
      input.style.left = "-10000px";
      input.style.top = "0";
      input.style.opacity = "0";
      if (options?.multiple) input.multiple = true;
      const extensions = options?.filters?.flatMap((f) => f.extensions ?? []) ?? [];
      if (extensions.length > 0) {
        input.accept = extensions
          .map((e) => (e.startsWith(".") ? e : `.${e.toLowerCase()}`))
          .join(",");
      }
      input.addEventListener("change", async () => {
        const files = Array.from(input.files ?? []);
        input.remove();
        if (files.length === 0) {
          resolve(null);
          return;
        }
        const paths = await stashPickedFiles(files);
        resolve(options?.multiple ? paths : (paths[0] ?? null));
      });
      document.body.appendChild(input);
      input.click();
    });
  }

  // ---- Database ----

  /**
   * One shared WebDatabase per path — migrations may open the same file via a
   * second loadDatabase call, and both handles MUST see the same SQL state.
   */
  async loadDatabase(path: string): Promise<IDatabase> {
    const normalized = path.replace(/^sqlite:/, "");
    let promise = this.dbInstances.get(normalized);
    if (!promise) {
      promise = WebDatabase.open(normalized);
      this.dbInstances.set(normalized, promise);
    }
    return promise;
  }

  // ---- Network ----

  fetch(url: string, options?: FetchOptions): Promise<Response> {
    return globalThis.fetch(rewriteProviderUrl(url), options as RequestInit | undefined);
  }

  async downloadFile(
    url: string,
    filePath: string,
    options?: { headers?: Record<string, string> },
  ): Promise<void> {
    const response = await globalThis.fetch(url, { headers: options?.headers });
    if (!response.ok) throw new Error(`downloadFile: ${response.status} ${response.statusText}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await vfsWriteFile(filePath, bytes);
  }

  createWebSocket(url: string, _options?: WebSocketOptions): Promise<IWebSocket> {
    return new Promise((resolve, reject) => {
      // Edge TTS (speech.platform.bing.com) rejects browser-originated
      // upgrade requests; the vite /edge-tts-relay tunnels it server-side
      // with the headers Edge expects.
      let wsUrl = url;
      try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.hostname === "speech.platform.bing.com") {
          wsUrl = `ws://${window.location.host}/edge-tts-relay${parsed.pathname}${parsed.search}`;
        }
      } catch {
        // keep original url
      }
      const ws = new WebSocket(wsUrl);
      let messageHandler: ((data: string | ArrayBuffer) => void) | null = null;
      let closeHandler: (() => void) | null = null;
      let errorHandler: ((error: unknown) => void) | null = null;
      ws.onmessage = (event) => messageHandler?.(event.data as string | ArrayBuffer);
      ws.onclose = () => closeHandler?.();
      ws.onerror = (event) => errorHandler?.(event);
      ws.onopen = () => {
        resolve({
          send: (data: string | ArrayBuffer) => ws.send(data),
          close: () => ws.close(),
          onMessage: (handler) => {
            messageHandler = handler;
          },
          onClose: (handler) => {
            closeHandler = handler;
          },
          onError: (handler) => {
            errorHandler = handler;
          },
        });
      };
      ws.onerror = (event) => {
        if (ws.readyState !== WebSocket.OPEN) {
          reject(event);
          errorHandler?.(event);
        }
      };
    });
  }

  // ---- App info ----

  async getAppVersion(): Promise<string> {
    return "web-demo-1.0.0";
  }

  // ---- KV storage ----

  async kvGetItem(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  async kvSetItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }

  async kvRemoveItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async kvGetAllKeys(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key) keys.push(key);
    }
    return keys;
  }

  // ---- Clipboard ----

  async copyToClipboard(content: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      return;
    }
    throw new Error("Clipboard unavailable in this browser context");
  }

  // ---- File sharing / download ----

  async shareOrDownloadFile(
    content: string,
    filename: string,
    mimeType: string,
  ): Promise<string | null> {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return filename;
    } catch {
      return null;
    }
  }

  /** Flush every open WebDatabase (called on beforeunload). */
  async flushAllDatabases(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const promise of this.dbInstances.values()) {
      promises.push(promise.then((db) => db.flushForUnload()).catch(() => {}));
    }
    await Promise.all(promises);
  }

  // ---- Utilities for the web branch (non-interface helpers) ----

  /** Directory listing used by dev tooling / diagnostics on web. */
  async listDir(path: string): Promise<{ name: string; path: string; isDirectory: boolean }[]> {
    const entries = await vfsReadDir(path);
    return entries.map((e) => ({ name: e.name, path: e.path, isDirectory: e.isDirectory }));
  }

  async stat(path: string): Promise<{ size: number; isDirectory: boolean }> {
    return vfsStat(path);
  }

  async copy(from: string, to: string): Promise<void> {
    await vfsCopyFile(from, to);
  }

  /** Resolve a picked file to bytes through the VFS. */
  async readPickedFile(path: string): Promise<Uint8Array> {
    return vfsReadFile(path);
  }

  /** Object URL for a VFS file, created on demand (async). */
  async objectUrl(path: string): Promise<string> {
    return vfsObjectURL(path);
  }
}
