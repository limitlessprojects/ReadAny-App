/**
 * UpdateNotification — fixed bottom-right toast that appears when a new version is available.
 * Auto-checks on mount (with a short delay), then shows a persistent notification
 * until the user dismisses or clicks update.
 */
import { checkForUpdate, downloadAndInstall, getDownloadProgress, relaunchApp, type UpdateInfo } from "@/lib/updater";
import { ArrowDownToLine, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

// Web build has no Tauri updater — skip the check entirely.
const IS_WEB = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

export function UpdateNotification() {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (IS_WEB) return; // no Tauri updater on web
    // Check for updates 5 seconds after app starts (don't block startup)
    const timer = setTimeout(async () => {
      try {
        const result = await checkForUpdate();
        if (result) setUpdate(result);
      } catch {
        // Silent failure — don't bother user if check fails
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleUpdate = useCallback(async () => {
    setDownloading(true);
    const intervalId = setInterval(() => {
      setProgress(getDownloadProgress());
    }, 200);

    const success = await downloadAndInstall();
    clearInterval(intervalId);
    setDownloading(false);

    if (success) {
      setReady(true);
    }
  }, []);

  const handleRelaunch = useCallback(async () => {
    await relaunchApp();
  }, []);

  if (!update || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-72 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-lg border border-border bg-background/95 p-4 shadow-lg backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              {t("updater.newVersion", "New version available")}
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Version info */}
        <p className="mt-1.5 text-xs text-muted-foreground">
          v{update.version} {t("updater.isReady", "is ready to install")}
        </p>

        {/* Action */}
        <div className="mt-3">
          {ready ? (
            <button
              onClick={handleRelaunch}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("updater.relaunch", "Restart to update")}
            </button>
          ) : downloading ? (
            <div className="space-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-center text-[10px] text-muted-foreground">
                {t("updater.downloading", "Downloading...")} {progress}%
              </p>
            </div>
          ) : (
            <button
              onClick={handleUpdate}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              {t("updater.install", "Download & Install")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
