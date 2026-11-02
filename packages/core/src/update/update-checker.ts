/**
 * GitHub Releases update checker — checks for new app versions.
 * Works on both desktop and mobile via IPlatformService.fetch().
 */

import type { IPlatformService } from "../services/platform";

const GITHUB_API_URL = "https://api.github.com/repos/codedogQBY/ReadAny/releases/latest";
const THROTTLE_KEY = "update_last_check_at";
const THROTTLE_HOURS = 24;

export interface ReleaseInfo {
  version: string;
  notes: string;
  htmlUrl: string;
  publishedAt: string;
  assets: Array<{
    name: string;
    downloadUrl: string;
    size: number;
  }>;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  release?: ReleaseInfo;
}

/**
 * Check for a new version of the app via GitHub Releases API.
 *
 * @param currentVersion Current app version (e.g. "1.0.0")
 * @param platform Platform service for fetch and KV
 * @param force If true, skip throttle check
 */
export async function checkForUpdate(
  currentVersion: string,
  platform: IPlatformService,
  force = false,
): Promise<UpdateCheckResult> {
  // Throttle auto-checks to once per day
  if (!force) {
    const lastCheck = await platform.kvGetItem(THROTTLE_KEY);
    if (lastCheck) {
      const elapsed = Date.now() - Number.parseInt(lastCheck, 10);
      if (elapsed < THROTTLE_HOURS * 60 * 60 * 1000) {
        return { hasUpdate: false, currentVersion };
      }
    }
  }

  const response = await platform.fetch(GITHUB_API_URL, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const release = await response.json();
  await platform.kvSetItem(THROTTLE_KEY, String(Date.now()));

  const latestVersion = (release.tag_name || "").replace(/^v/, "");
  const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

  return {
    hasUpdate,
    currentVersion,
    latestVersion,
    release: hasUpdate
      ? {
          version: latestVersion,
          notes: release.body || "",
          htmlUrl: release.html_url || "",
          publishedAt: release.published_at || "",
          assets: (release.assets || []).map(
            (a: {
              name: string;
              browser_download_url: string;
              size: number;
            }) => ({
              name: a.name,
              downloadUrl: a.browser_download_url,
              size: a.size,
            }),
          ),
        }
      : undefined,
  };
}

/** Compare two semver version strings. Returns >0 if a > b, <0 if a < b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}
