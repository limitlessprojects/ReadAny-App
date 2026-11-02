/**
 * Tauri api/core shim — active only when READANY_WEB=1 (vite alias).
 *
 * Implements the tiny slice of the Tauri IPC surface the web build can
 * provide natively:
 *   - convertFileSrc(): object URLs from the WebVFS (covers, fonts)
 *   - invoke("sync_hash_file"): SHA-256 via WebCrypto over VFS bytes
 *   - invoke("get_webview_version"): browser user agent
 * Every other command throws a descriptive error (vector DB, LAN sync and
 * CLI bridges are desktop-only subsystems that the web build doesn't use).
 */
import { vfsCachedObjectURL, vfsReadFile } from "./web-vfs";

export function convertFileSrc(filePath: string, _protocol = "asset"): string {
  return vfsCachedObjectURL(filePath);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "sync_hash_file": {
      const path = String(args?.path ?? "");
      const bytes = await vfsReadFile(path);
      return sha256Hex(bytes) as T;
    }
    case "get_webview_version":
      return navigator.userAgent as T;
    default:
      throw new Error(
        `Web build: Tauri command "${cmd}" is unavailable (desktop-only subsystem).`,
      );
  }
}

export const isTauri = () => false;

/** TransformCallback type exists only to satisfy stray type imports. */
export type TransformCallback = (transform: string) => string;

export const SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";

/** Minimal Channel stand-in — plugin dist files import it at module scope. */
export class Channel<T = unknown> {
  id = 0;
  #onmessage: ((response: T) => void) | null = null;
  set onmessage(handler: ((response: T) => void) | undefined) {
    this.#onmessage = handler ?? null;
  }
  get onmessage(): ((response: T) => void) | undefined {
    return this.#onmessage ?? undefined;
  }
  toJSON() {
    return `__CHANNEL__:${this.id}`;
  }
}

/** Minimal Resource stand-in for plugin classes the web build never instantiates. */
export class Resource {
  #rid: number;
  constructor(rid: number) {
    this.#rid = rid;
  }
  get rid(): number {
    return this.#rid;
  }
  static async __isResource(resource: unknown): Promise<boolean> {
    return resource instanceof Resource;
  }
  async close(): Promise<void> {}
}

export default { invoke, convertFileSrc, isTauri, Channel, Resource };
