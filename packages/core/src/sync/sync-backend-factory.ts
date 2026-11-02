/**
 * Sync backend factory — creates the appropriate backend based on configuration.
 */

import { type LANBackend, createLANBackend } from "./lan-backend";
import { S3Backend } from "./s3-backend";
import type { ISyncBackend, S3Config, SyncConfig, WebDavConfig } from "./sync-backend";
import { WebDavBackend } from "./webdav-backend";

/**
 * Create a sync backend from configuration.
 * For WebDAV and S3, secrets must be retrieved separately from secure storage.
 */
export function createSyncBackend(
  config: SyncConfig,
  secret: string,
  deviceName?: string,
): ISyncBackend {
  switch (config.type) {
    case "webdav":
      return new WebDavBackend(config as WebDavConfig, secret);
    case "s3":
      return new S3Backend(config as S3Config, secret);
    case "lan":
      // For LAN, secret is the server URL, deviceName is passed separately
      return createLANBackend(secret, "", deviceName || "Unknown Device");
    default:
      throw new Error(`Unknown sync backend type: ${(config as { type: string }).type}`);
  }
}

/**
 * Create a LAN backend for receiving data.
 */
export function createLANReceiverBackend(
  serverUrl: string,
  pairCode: string,
  deviceName: string,
): LANBackend {
  return createLANBackend(serverUrl, pairCode, deviceName);
}

/**
 * Get the secret key for a backend type.
 */
export function getSecretKeyForBackend(type: "webdav" | "s3"): string {
  const keys = {
    webdav: "sync_webdav_password",
    s3: "sync_s3_secret_key",
  };
  return keys[type];
}
