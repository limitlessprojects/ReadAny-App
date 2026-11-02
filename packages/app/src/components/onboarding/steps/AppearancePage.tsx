import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Coffee, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type ThemeMode = "light" | "dark" | "sepia";

const THEME_CONFIG: Record<ThemeMode, { icon: typeof Sun; labelKey: string }> = {
  light: { icon: Sun, labelKey: "settings.light" },
  dark: { icon: Moon, labelKey: "settings.dark" },
  sepia: { icon: Coffee, labelKey: "settings.sepia" },
};

import { OnboardingLayout } from "../OnboardingLayout";

export function AppearancePage({ onNext, onPrev, step, totalSteps }: any) {
  const { t, i18n } = useTranslation();
  const [theme, setThemeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("readany-theme") as ThemeMode | null;
    if (saved && THEME_CONFIG[saved]) {
      setThemeState(saved);
    }
  }, []);

  const handleLanguageChange = async (lang: string) => {
    const { changeAndPersistLanguage } = await import("@readany/core/i18n");
    await changeAndPersistLanguage(lang);
  };

  const handleThemeChange = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("readany-theme", newTheme);
  };

  return (
    <OnboardingLayout
      illustration="/illustrations/smiling_girl.svg"
      step={step}
      totalSteps={totalSteps}
      footer={
        <>
          <Button variant="ghost" onClick={onPrev}>
            {t("common.back", "Back")}
          </Button>
          <Button onClick={onNext} size="lg" className="rounded-full px-8 shadow-md">
            {t("common.next", "Next")} →
          </Button>
        </>
      }
    >
      <div className="animate-in fade-in slide-in-from-right-4 duration-500 flex-1 flex flex-col justify-center">
        <div className="space-y-2 text-center mb-6">
          <h2 className="text-2xl font-bold tracking-tight">
            {t("onboarding.appearance.title", "Appearance & Language")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("onboarding.appearance.desc", "Customize ReadAny to suit your preferences.")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-medium text-foreground uppercase tracking-wide">
              {t("settings.theme", "Theme")}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(THEME_CONFIG) as ThemeMode[]).map((mode) => {
                const config = THEME_CONFIG[mode];
                const Icon = config.icon;
                const isActive = theme === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => handleThemeChange(mode)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border py-3 transition-all duration-300 ${
                      isActive
                        ? "border-primary bg-primary/10 text-primary shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                        : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{t(config.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-medium text-foreground uppercase tracking-wide">
              {t("settings.language", "Language")}
            </h3>
            <Select value={i18n.language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="h-10 rounded-lg font-medium text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="zh">{t("settings.simplifiedChinese", "中文")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </OnboardingLayout>
  );
}
