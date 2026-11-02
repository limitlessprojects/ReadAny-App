/**
 * WebVFS — virtual file system for the web build of ReadAny.
 *
 * Backed by OPFS (Origin Private File System) when available, with an
 * in-memory fallback. All paths are POSIX-style ("/data/readany.db",
 * "books/abc.pdf"); leading slashes are normalized away.
 *
 * Also maintains an object-URL cache (path -> blob: URL) so that
 * `convertFileSrc` can return synchronously-fetchable URLs for small
 * assets (covers, fonts) without a service worker.
 */

const MEMORY_STORE = new Map<string, Uint8Array>();
const OBJECT_URLS = new Map<string, string>();

/** Max byte size for files that get a pre-created object URL (covers, fonts). */
export const OBJECT_URL_MAX_BYTES = 2 * 1024 * 1024;

let opfsRoot: FileSystemDirectoryHandle | null | undefined; // undefined = not probed yet

async function getRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (opfsRoot !== undefined) return opfsRoot;
  try {
    opfsRoot = await navigator.storage.getDirectory();
  } catch {
    opfsRoot = null;
  }
  return opfsRoot;
}

function normalizeSegments(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..");
}

function memoryKey(path: string): string {
  return "/" + normalizeSegments(path).join("/");
}

async function getDirHandle(
  segments: string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  const root = await getRoot();
  if (!root) return null;
  let dir = root;
  for (const seg of segments) {
    try {
      dir = await dir.getDirectoryHandle(seg, { create });
    } catch {
      return null;
    }
  }
  return dir;
}

function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === "string" ? new TextEncoder().encode(data) : data;
}

function setBytes(path: string, bytes: Uint8Array): void {
  const key = memoryKey(path);
  MEMORY_STORE.set(key, bytes);
  cacheObjectURL(key, bytes);
}

function cacheObjectURL(key: string, bytes: Uint8Array): void {
  const old = OBJECT_URLS.get(key);
  if (old) URL.revokeObjectURL(old);
  if (bytes.byteLength <= OBJECT_URL_MAX_BYTES) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    OBJECT_URLS.set(key, URL.createObjectURL(new Blob([copy])));
  }
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

export async function vfsWriteFile(path: string, data: Uint8Array | string): Promise<void> {
  const bytes = toBytes(data);
  const segments = normalizeSegments(path);
  const name = segments.pop();
  if (!name) throw new Error(`vfsWriteFile: invalid path: ${path}`);
  const dir = await getDirHandle(segments, true);
  if (dir) {
    const fh = await dir.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    await writable.write(bytes as unknown as FileSystemWriteChunkType);
    await writable.close();
    setBytes(path, bytes); // keep object-URL cache warm for convertFileSrc
    return;
  }
  setBytes(path, bytes);
}

export async function vfsReadFile(path: string): Promise<Uint8Array> {
  const segments = normalizeSegments(path);
  const name = segments.pop();
  if (!name) throw new Error(`vfsReadFile: invalid path: ${path}`);
  const dir = await getDirHandle(segments, false);
  if (dir) {
    const fh = await dir.getFileHandle(name);
    const file = await fh.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }
  const mem = MEMORY_STORE.get(memoryKey(path));
  if (!mem) throw new Error(`vfsReadFile: not found: ${path}`);
  return mem;
}

export async function vfsExists(path: string): Promise<boolean> {
  const segments = normalizeSegments(path);
  const name = segments.pop();
  if (!name) return false;
  const dir = await getDirHandle(segments, false);
  if (dir) {
    try {
      await dir.getFileHandle(name);
      return true;
    } catch {
      try {
        await dir.getDirectoryHandle(name);
        return true;
      } catch {
        return false;
      }
    }
  }
  return MEMORY_STORE.has(memoryKey(path));
}

export async function vfsDeleteFile(path: string): Promise<void> {
  const segments = normalizeSegments(path);
  const name = segments.pop();
  if (!name) return;
  const dir = await getDirHandle(segments, false);
  if (dir) {
    try {
      await dir.removeEntry(name, { recursive: true });
    } catch {
      // already gone — treat as success (Tauri remove semantics vary)
    }
  }
  const key = memoryKey(path);
  MEMORY_STORE.delete(key);
  const url = OBJECT_URLS.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    OBJECT_URLS.delete(key);
  }
}

export async function vfsCopyFile(from: string, to: string): Promise<void> {
  const bytes = await vfsReadFile(from);
  await vfsWriteFile(to, bytes);
}

export async function vfsReadTextFile(path: string): Promise<string> {
  return new TextDecoder().decode(await vfsReadFile(path));
}

export async function vfsWriteTextFile(path: string, content: string): Promise<void> {
  await vfsWriteFile(path, content);
}

/** Create all directory segments (Tauri mkdir with recursive semantics). */
export async function vfsMkdir(path: string): Promise<void> {
  const dir = await getDirHandle(normalizeSegments(path), true);
  if (!dir && !("storage" in navigator)) {
    // memory fallback: nothing to do, dirs are implicit
  }
}

export interface VfsStat {
  size: number;
  isDirectory: boolean;
}

export async function vfsStat(path: string): Promise<VfsStat> {
  const segments = normalizeSegments(path);
  const name = segments.pop();
  if (!name) throw new Error(`vfsStat: invalid path: ${path}`);
  const dir = await getDirHandle(segments, false);
  if (dir) {
    try {
      const fh = await dir.getFileHandle(name);
      const file = await fh.getFile();
      return { size: file.size, isDirectory: false };
    } catch {
      try {
        await dir.getDirectoryHandle(name);
        return { size: 0, isDirectory: true };
      } catch {
        throw new Error(`vfsStat: not found: ${path}`);
      }
    }
  }
  const mem = MEMORY_STORE.get(memoryKey(path));
  if (!mem) throw new Error(`vfsStat: not found: ${path}`);
  return { size: mem.byteLength, isDirectory: false };
}

export interface VfsDirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
}

/** List a directory (OPFS iteration, memory fallback via prefix scan). */
export async function vfsReadDir(path: string): Promise<VfsDirEntry[]> {
  const segments = normalizeSegments(path);
  const dir = await getDirHandle(segments, false);
  if (dir) {
    const entries: VfsDirEntry[] = [];
    // @ts-expect-error async iteration of directory handle is standard but not in older lib.dom
    for await (const [name, handle] of dir.entries()) {
      const isDirectory = handle.kind === "directory";
      let size: number | undefined;
      if (!isDirectory) {
        try {
          const file = await (handle as FileSystemFileHandle).getFile();
          size = file.size;
        } catch {
          size = undefined;
        }
      }
      entries.push({
        name,
        path: "/" + [...segments, name].join("/"),
        isDirectory,
        size,
      });
    }
    return entries;
  }
  // memory fallback
  const prefix = memoryKey(path === "/" ? "" : path).replace(/\/$/, "");
  const out: VfsDirEntry[] = [];
  const seen = new Set<string>();
  for (const key of MEMORY_STORE.keys()) {
    if (!key.startsWith(prefix + "/")) continue;
    const rest = key.slice(prefix.length + 1);
    const first = rest.split("/")[0];
    if (!first || seen.has(first)) continue;
    seen.add(first);
    const isDirectory = rest.includes("/");
    out.push({
      name: first,
      path: `${prefix}/${first}`,
      isDirectory,
      size: isDirectory ? undefined : MEMORY_STORE.get(key)?.byteLength,
    });
  }
  return out;
}

/**
 * Recursively list all files in the VFS (used at startup to re-warm the
 * object-URL cache for covers/fonts after a page reload).
 */
export async function vfsListAll(): Promise<VfsDirEntry[]> {
  const root = await getRoot();
  if (!root) {
    return [...MEMORY_STORE.keys()].map((key) => ({
      name: key.split("/").pop() ?? key,
      path: key,
      isDirectory: false,
      size: MEMORY_STORE.get(key)?.byteLength,
    }));
  }
  const out: VfsDirEntry[] = [];
  async function walk(dir: FileSystemDirectoryHandle, prefix: string[]): Promise<void> {
    // @ts-expect-error async iteration of directory handle is standard but not in older lib.dom
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === "directory") {
        await walk(handle as FileSystemDirectoryHandle, [...prefix, name]);
      } else {
        let size: number | undefined;
        try {
          size = await (handle as FileSystemFileHandle).getFile().then((f) => f.size);
        } catch {
          size = undefined;
        }
        out.push({
          name,
          path: "/" + [...prefix, name].join("/"),
          isDirectory: false,
          size,
        });
      }
    }
  }
  await walk(root, []);
  return out;
}

/** Get (creating if needed) the object URL for a VFS path, reading from storage. */
export async function vfsObjectURL(path: string): Promise<string> {
  const key = memoryKey(path);
  const existing = OBJECT_URLS.get(key);
  if (existing) return existing;
  const bytes = await vfsReadFile(path);
  cacheObjectURL(key, bytes);
  return OBJECT_URLS.get(key) ?? "";
}

/** Synchronous lookup only — returns "" when the URL hasn't been warmed. */
export function vfsCachedObjectURL(path: string): string {
  return OBJECT_URLS.get(memoryKey(path)) ?? "";
}

/** Re-warm object URLs for small files after a reload (covers, fonts). */
export async function warmObjectUrls(): Promise<void> {
  try {
    const entries = await vfsListAll();
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      if ((entry.size ?? Infinity) > OBJECT_URL_MAX_BYTES) continue;
      try {
        await vfsObjectURL(entry.path);
      } catch {
        // ignore individual failures
      }
    }
  } catch {
    // OPFS unavailable or empty — nothing to warm
  }
}

/** Persist a WebDatabase blob (called by the sql.js adapter with debounce). */
export async function vfsPersistBytes(path: string, bytes: Uint8Array): Promise<void> {
  await vfsWriteFile(path, bytes);
}

/** Request-persistent storage so the library survives reloads where possible. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // not critical
  }
}
