/**
 * Tauri api/path shim — active only when READANY_WEB=1 (vite alias).
 *
 * The real @tauri-apps/api/path internally calls Tauri IPC (its `../core`
 * relative import bypasses specifier aliases), so the web build provides the
 * same POSIX-path helpers over WebVFS conventions:
 *   appDataDir()/dataDir() → "/data"   (WebPlatformService DATA_ROOT)
 *   tempDir()              → "/tmp"
 *   join/basename/dirname/extname → pure POSIX helpers
 */

const DATA_ROOT = "/data";
const TMP_DIR = "/tmp";

export async function appDataDir(): Promise<string> {
  return DATA_ROOT;
}

export async function dataDir(): Promise<string> {
  return DATA_ROOT;
}

export async function tempDir(): Promise<string> {
  return TMP_DIR;
}

export async function localDataDir(): Promise<string> {
  return DATA_ROOT;
}

export async function audioDir(): Promise<string> {
  return DATA_ROOT;
}

export async function pictureDir(): Promise<string> {
  return DATA_ROOT;
}

export async function videoDir(): Promise<string> {
  return DATA_ROOT;
}

export async function downloadDir(): Promise<string> {
  return DATA_ROOT;
}

export async function documentDir(): Promise<string> {
  return DATA_ROOT;
}

export async function homeDir(): Promise<string> {
  return DATA_ROOT;
}

export async function configDir(): Promise<string> {
  return DATA_ROOT;
}

function posixJoin(...parts: string[]): string {
  const filtered = parts.filter((p) => p !== undefined && p !== null && p !== "");
  if (filtered.length === 0) return "";
  let joined = filtered
    .map((p) => String(p).replace(/\\/g, "/"))
    .join("/")
    .replace(/\/{2,}/g, "/");
  if (!joined.startsWith("/")) joined = "/" + joined;
  return joined;
}

export async function join(...parts: string[]): Promise<string> {
  return posixJoin(...parts);
}

export async function dirname(path: string): Promise<string> {
  const normalized = String(path).replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return idx === 0 ? "/" : ".";
  return normalized.slice(0, idx);
}

export async function basename(path: string, ext?: string): Promise<string> {
  const normalized = String(path).replace(/\\/g, "/");
  let name = normalized.slice(normalized.lastIndexOf("/") + 1);
  if (ext && name.endsWith(ext)) {
    name = name.slice(0, -ext.length);
  }
  return name;
}

export async function extname(path: string): Promise<string> {
  const name = await basename(path);
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(idx) : "";
}

export async function isAbsolute(path: string): Promise<boolean> {
  return String(path).startsWith("/") || /^[A-Za-z]:[\\/]/.test(String(path));
}

export async function normalize(path: string): Promise<string> {
  const segments = String(path).replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const seg of segments) {
    if (!seg || seg === ".") continue;
    if (seg === ".." && out.length > 0 && out[out.length - 1] !== "..") {
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return (String(path).startsWith("/") ? "/" : "") + out.join("/");
}

export async function resolve(...parts: string[]): Promise<string> {
  let resolved = "";
  for (const part of parts) {
    if (await isAbsolute(part)) {
      resolved = part;
    } else {
      resolved = posixJoin(resolved || DATA_ROOT, part);
    }
  }
  return resolved || DATA_ROOT;
}

export default {
  appDataDir,
  dataDir,
  tempDir,
  join,
  dirname,
  basename,
  extname,
  isAbsolute,
  normalize,
  resolve,
};
