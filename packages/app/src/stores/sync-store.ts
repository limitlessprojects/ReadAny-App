/**
 * Desktop sync store — re-exports the shared sync store from core.
 * The DesktopSyncAdapter must be registered via setSyncAdapter() at app startup.
 */
export { useSyncStore } from "@readany/core/stores";
export type { SyncState } from "@readany/core/stores";
