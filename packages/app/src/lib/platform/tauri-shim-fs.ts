/**
 * Tauri plugin-fs shim — active only when READANY_WEB=1 (vite alias).
 *
 * Routes the exact `@tauri-apps/plugin-fs` API surface used by the app into
 * the OPFS-backed WebVFS, so library-store / DesktopImportActions /
 * sync-adapter work unmodified in the browser build.
 */
import {
  vfsCopyFile,
  vfsDeleteFile,
  vfsExists,
  vfsMkdir,
  vfsReadDir,
  vfsReadFile,
  vfsReadTextFile,
  vfsStat,
  vfsWriteFile,
  vfsWriteTextFile,
} from "./web-vfs";

export interface MkdirOptions {
  recursive?: boolean;
  baseDir?: unknown;
}

export interface RemoveOptions {
  recursive?: boolean;
}

export interface StatOptions {
  baseDir?: unknown;
}

export async function readFile(path: string): Promise<Uint8Array> {
  return vfsReadFile(path);
}

export async function readTextFile(path: string): Promise<string> {
  return vfsReadTextFile(path);
}

export async function writeFile(path: string, contents: Uint8Array | string): Promise<void> {
  await vfsWriteFile(path, contents);
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await vfsWriteTextFile(path, contents);
}

export async function mkdir(path: string, _options?: MkdirOptions): Promise<void> {
  // WebVFS directories are implicit; this creates every segment.
  await vfsMkdir(path);
}

export async function exists(path: string): Promise<boolean> {
  return vfsExists(path);
}

export async function remove(path: string, _options?: RemoveOptions): Promise<void> {
  await vfsDeleteFile(path);
}

export async function copyFile(fromPath: string, toPath: string): Promise<void> {
  await vfsCopyFile(fromPath, toPath);
}

export async function rename(fromPath: string, toPath: string): Promise<void> {
  await vfsCopyFile(fromPath, toPath);
  await vfsDeleteFile(fromPath);
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink?: boolean;
}

export async function readDir(path: string): Promise<DirEntry[]> {
  const entries = await vfsReadDir(path);
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory,
    isFile: !entry.isDirectory,
  }));
}

export interface FileStat {
  isDirectory: boolean;
  isFile: boolean;
  isSymlink?: boolean;
  name: string;
  size: number;
  mtime: Date | null;
  readOnly: boolean;
}

export async function stat(path: string, _options?: StatOptions): Promise<FileStat> {
  const result = await vfsStat(path);
  return {
    isDirectory: result.isDirectory,
    isFile: !result.isDirectory,
    name: path.split("/").filter(Boolean).pop() ?? path,
    size: result.size,
    mtime: null,
    readOnly: false,
  };
}
