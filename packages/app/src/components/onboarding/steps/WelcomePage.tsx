import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@readany/core/stores/settings-store";
import { Bot, Languages, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { OnboardingLayout } from "../OnboardingLayout";

export function WelcomePage({ onNext, onPrev: _onPrev, step, totalSteps }: any) {
  const { t } = useTranslation();
  const { completeOnboarding } = useSettingsStore();

  const handleSkip = () => {
    completeOnboarding();
  };

  const features = [
    {
      icon: <Bot className="h-6 w-6 text-indigo-500" />,
      title: t("onboarding.welcome.ai", "AI Co-pilot"),
      desc: t("onboarding.welcome.aiDesc", "Discuss books naturally with AI"),
    },
    {
      icon: <Search className="h-6 w-6 text-emerald-500" />,
      title: t("onboarding.welcome.search", "Smart Search"),
      desc: t("onboarding.welcome.searchDesc", "Semantic knowledge retrieval"),
    },
    {
      icon: <Languages className="h-6 w-6 text-rose-500" />,
      title: t("onboarding.welcome.translate", "Instant Translation"),
      desc: t("onboarding.welcome.translateDesc", "Seamless bilingual reading"),
    },
  ];

  return (
    <OnboardingLayout
      illustration="/illustrations/reading.svg"
      step={step}
      totalSteps={totalSteps}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="text-muted-foreground hover:text-foreground"
          >
            {t("onboarding.skip", "Skip completely")}
          </Button>
          <Button
            onClick={onNext}
            size="lg"
            className="rounded-full px-8 shadow-lg shadow-primary/25 group"
          >
            {t("onboarding.welcome.start", "Get Started")}
            <span className="ml-2 transition-transform group-hover:translate-x-1">→</span>
          </Button>
        </>
      }
    >
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 flex-1 flex flex-col justify-center">
        <div className="space-y-2 text-center mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t("onboarding.welcome.title", "Welcome to ReadAny").split(" ").slice(0, 2).join(" ")}{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-500">
              {t("onboarding.welcome.title", "Welcome to ReadAny").split(" ").slice(2).join(" ")}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "onboarding.welcome.subtitle",
              "Your intelligent reading companion. Let's set up your ultimate reading environment.",
            )}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-2 rounded-xl bg-muted/40 p-4 text-center transition-colors hover:bg-muted/80"
            >
              <div className="rounded-lg bg-background/80 p-2.5 shadow-sm">{f.icon}</div>
              <h3 className="font-semibold text-sm">{f.title}</h3>
              <p className="text-xs text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </OnboardingLayout>
  );
}
