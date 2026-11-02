import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve } from "node:path";

export type InstallMode = "user" | "global";

export type InstallOptions = {
  binPath: string;
  mode?: InstallMode;
  userBinDir?: string;
  globalBinDir?: string;
  platformName?: NodeJS.Platform;
  removePathShims?: boolean;
  pathEnv?: string;
};

export type InstallResult = {
  installed: true;
  path: string;
  target: string;
  mode: InstallMode;
};

export type UninstallResult = {
  removed: boolean;
  path: string;
  mode: InstallMode;
  extraRemoved?: string[];
};

const MANAGED_SHIM_MARKER = "readany-cli-managed";

function getDefaultUserBinDir(platformName: NodeJS.Platform): string {
  if (platformName === "win32") {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "ReadAny", "bin");
  }

  return join(homedir(), ".local", "bin");
}

function getDefaultGlobalBinDir(platformName: NodeJS.Platform): string {
  if (platformName === "win32") {
    return join(process.env.ProgramFiles ?? "C:\\Program Files", "ReadAny", "bin");
  }

  return "/usr/local/bin";
}

export function resolveShimPath(options: InstallOptions): {
  path: string;
  mode: InstallMode;
  platformName: NodeJS.Platform;
} {
  const mode = options.mode ?? "user";
  const platformName = options.platformName ?? platform();
  const binDir =
    mode === "global"
      ? (options.globalBinDir ?? getDefaultGlobalBinDir(platformName))
      : (options.userBinDir ?? getDefaultUserBinDir(platformName));
  const commandName = platformName === "win32" ? "readany.cmd" : "readany";

  return {
    path: join(binDir, commandName),
    mode,
    platformName,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function pathsReferenceSameFile(firstPath: string, secondPath: string): Promise<boolean> {
  if (firstPath === secondPath) return true;

  try {
    return (await realpath(firstPath)) === (await realpath(secondPath));
  } catch {
    return false;
  }
}

async function targetLooksLikeReadAnyCli(targetPath: string): Promise<boolean> {
  const targetName = basename(targetPath);
  if (!["readany", "readany.js", "readany.ts"].includes(targetName)) return false;
  const content = await readFile(targetPath, "utf8").catch(() => "");
  return content.includes(MANAGED_SHIM_MARKER);
}

export async function isManagedShim(shimPath: string, binPath: string): Promise<boolean> {
  if (!(await pathExists(shimPath))) return false;

  const stat = await lstat(shimPath);
  if (stat.isSymbolicLink()) {
    const target = await readlink(shimPath);
    const targetPath = isAbsolute(target) ? target : resolve(dirname(shimPath), target);
    if (await pathsReferenceSameFile(targetPath, binPath)) return true;
    if (await targetLooksLikeReadAnyCli(targetPath)) return true;
  } else {
    const content = await readFile(shimPath, "utf8").catch(() => "");
    if (content.includes(MANAGED_SHIM_MARKER)) return true;
  }

  return false;
}

async function assertManagedShim(shimPath: string, binPath: string): Promise<void> {
  if (!(await pathExists(shimPath))) return;
  if (await isManagedShim(shimPath, binPath)) return;

  const name = basename(shimPath);
  throw new Error(`${name} already exists and is not managed by ReadAny CLI: ${shimPath}`);
}

function pathShimCandidates(platformName: NodeJS.Platform, pathEnv: string): string[] {
  const commandName = platformName === "win32" ? "readany.cmd" : "readany";
  const paths = pathEnv
    .split(delimiter)
    .filter(Boolean)
    .map((path) => resolve(path, commandName));
  return [...new Set(paths)];
}

async function removeAdditionalManagedPathShims(
  primaryShimPath: string,
  options: InstallOptions,
  platformName: NodeJS.Platform,
): Promise<string[]> {
  const primary = resolve(primaryShimPath);
  const removed: string[] = [];

  for (const candidate of pathShimCandidates(platformName, options.pathEnv ?? "")) {
    if (resolve(candidate) === primary) continue;
    if (!(await pathExists(candidate))) continue;
    if (!(await isManagedShim(candidate, options.binPath))) continue;

    await rm(candidate, { force: true });
    removed.push(candidate);
  }

  return removed;
}

export async function installCli(options: InstallOptions): Promise<InstallResult> {
  const shim = resolveShimPath(options);
  await mkdir(dirname(shim.path), { recursive: true });
  await assertManagedShim(shim.path, options.binPath);
  await rm(shim.path, { force: true });

  if (shim.platformName === "win32") {
    await writeFile(
      shim.path,
      `@echo off\r\nREM ${MANAGED_SHIM_MARKER}\r\nnode "${options.binPath}" %*\r\n`,
      "utf8",
    );
  } else {
    await symlink(options.binPath, shim.path);
    await chmod(options.binPath, 0o755).catch(() => {});
  }

  return {
    installed: true,
    path: shim.path,
    target: options.binPath,
    mode: shim.mode,
  };
}

export async function uninstallCli(options: InstallOptions): Promise<UninstallResult> {
  const shim = resolveShimPath(options);
  let removed = false;

  if (await pathExists(shim.path)) {
    await assertManagedShim(shim.path, options.binPath);
    await rm(shim.path, { force: true });
    removed = true;
  }

  const extraRemoved = options.removePathShims
    ? await removeAdditionalManagedPathShims(shim.path, options, shim.platformName)
    : [];
  return {
    removed,
    path: shim.path,
    mode: shim.mode,
    ...(extraRemoved.length > 0 ? { extraRemoved } : {}),
  };
}
