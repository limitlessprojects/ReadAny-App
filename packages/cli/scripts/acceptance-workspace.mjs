import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(scriptDir, "../../..");
const defaultWorkspaceFile = "workspace.json";

export function resolveInputPath(path) {
  if (isAbsolute(path)) return path;
  const fromCwd = resolve(process.cwd(), path);
  if (process.cwd() !== repoRoot && path.startsWith("docs/")) {
    return resolve(repoRoot, path);
  }
  return fromCwd;
}

export async function loadWorkspaceConfig(workspacePathInput) {
  const resolved = resolveInputPath(workspacePathInput);
  const workspaceFile = resolved.endsWith(".json") ? resolved : resolve(resolved, defaultWorkspaceFile);
  const workspace = JSON.parse(await readFile(workspaceFile, "utf8"));
  return {
    workspaceFile,
    workspace,
  };
}

export function workspaceEvidenceFiles(workspace) {
  return [
    workspace?.evidenceFiles?.realSample,
    workspace?.evidenceFiles?.agentCodex,
    workspace?.evidenceFiles?.agentSecondClient,
    workspace?.evidenceFiles?.desktopSettings,
    workspace?.evidenceFiles?.packagedMacos,
    workspace?.evidenceFiles?.packagedWindows,
    workspace?.evidenceFiles?.packagedLinux,
  ].filter(Boolean);
}

export function normalizeWorkspaceClientName(name) {
  const normalized = String(name ?? "").trim().toLowerCase();
  if (/codex/.test(normalized)) return "codex";
  if (/claude/.test(normalized)) return "claude";
  if (/cursor/.test(normalized)) return "cursor";
  return normalized;
}

export function normalizeWorkspacePlatform(platform) {
  const normalized = String(platform ?? "").trim().toLowerCase();
  if (["macos", "mac", "darwin"].includes(normalized)) return "macos";
  if (["windows", "win32", "win"].includes(normalized)) return "windows";
  if (normalized === "linux") return "linux";
  return normalized;
}

export function workspaceRealSamplePath(workspace) {
  return workspace?.evidenceFiles?.realSample;
}

export function workspaceAgentEvidencePath(workspace, clientName) {
  const client = normalizeWorkspaceClientName(clientName);
  if (client === "codex") return workspace?.evidenceFiles?.agentCodex;
  if (client) return workspace?.evidenceFiles?.agentSecondClient;
  return undefined;
}

export function workspaceDesktopSettingsPath(workspace) {
  return workspace?.evidenceFiles?.desktopSettings;
}

export function workspacePackagedEvidencePath(workspace, platform) {
  const normalized = normalizeWorkspacePlatform(platform);
  if (normalized === "macos") return workspace?.evidenceFiles?.packagedMacos;
  if (normalized === "windows") return workspace?.evidenceFiles?.packagedWindows;
  if (normalized === "linux") return workspace?.evidenceFiles?.packagedLinux;
  return undefined;
}

export function workspaceRecordPath(workspace) {
  return workspace?.paths?.recordPath;
}

export function workspaceFinalManifestPath(workspace) {
  return workspace?.outputs?.finalManifestPath;
}

export function workspaceBundleDir(workspace) {
  return workspace?.outputs?.bundleDir ?? workspace?.paths?.bundleDir;
}

export function workspaceMilestone(workspace) {
  return workspaceDefaultValue(workspace?.defaults?.milestone);
}

export function workspaceReviewer(workspace) {
  return workspaceDefaultValue(workspace?.defaults?.reviewer);
}

export function workspaceRelease(workspace) {
  return workspaceDefaultValue(workspace?.defaults?.release);
}

export function workspaceDesktopPackage(workspace) {
  return workspaceDefaultValue(workspace?.defaults?.desktopPackage);
}

function workspaceDefaultValue(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.toLowerCase() === "tbd") return undefined;
  return normalized;
}

export async function filterExistingPaths(paths) {
  const existing = [];
  for (const path of paths) {
    try {
      await access(path);
      existing.push(path);
    } catch {
      // Missing evidence is fine here; readiness/strict validation should report the gap.
    }
  }
  return existing;
}
