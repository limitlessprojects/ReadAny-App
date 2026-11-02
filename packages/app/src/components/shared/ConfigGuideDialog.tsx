import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppStore } from "@/stores/app-store";
import type { SettingsTab } from "@/stores/app-store";
/**
 * ConfigGuideDialog — modal dialog prompting user to configure AI or vector model.
 * Uses shadcn-ui Dialog components. Desktop version uses setShowSettings to open settings tab.
 */
import { useTranslation } from "react-i18next";

export type ConfigGuideType = "ai" | "vectorModel" | null;

interface ConfigGuideDialogProps {
  type: ConfigGuideType;
  onClose: () => void;
}

const CONFIG: Record<
  "ai" | "vectorModel",
  { titleKey: string; descKey: string; settingsTab: SettingsTab; actionKey: string }
> = {
  ai: {
    titleKey: "chat.notConfigured",
    descKey: "chat.notConfiguredDesc",
    settingsTab: "ai",
    actionKey: "chat.goSettings",
  },
  vectorModel: {
    titleKey: "vectorize.notConfigured",
    descKey: "vectorize.notConfiguredDesc",
    settingsTab: "vectorModel",
    actionKey: "vectorize.goSettings",
  },
};

export function ConfigGuideDialog({ type, onClose }: ConfigGuideDialogProps) {
  const { t } = useTranslation();
  const setShowSettings = useAppStore((s) => s.setShowSettings);

  if (!type) return null;
  const cfg = CONFIG[type];

  return (
    <Dialog
      open={!!type}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t(cfg.titleKey)}</DialogTitle>
          <DialogDescription>{t(cfg.descKey)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => {
              onClose();
              setShowSettings(true, cfg.settingsTab);
            }}
          >
            {t(cfg.actionKey)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
