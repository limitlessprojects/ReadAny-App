import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

import { OnboardingLayout } from "../OnboardingLayout";

export function CompletePage({ onNext, onPrev, step, totalSteps }: any) {
  const { t } = useTranslation();

  return (
    <OnboardingLayout
      illustration="/illustrations/celebration.svg"
      step={step}
      totalSteps={totalSteps}
      footer={
        <>
          <Button variant="ghost" onClick={onPrev}>
            {t("common.back", "Back")}
          </Button>
          <Button
            onClick={onNext}
            size="lg"
            className="rounded-full px-10 py-6 text-lg tracking-wide shadow-xl shadow-primary/30 group bg-primary hover:bg-primary/90 text-primary-foreground transform transition-transform hover:scale-105"
          >
            {t("onboarding.complete.start", "Start Reading")}
            <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
          </Button>
        </>
      }
    >
      <div className="animate-in fade-in slide-in-from-right-4 duration-500 flex-1 overflow-y-auto invisible-scrollbar pb-6 flex flex-col justify-center">
        <div className="space-y-3">
          <h2 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-500">
            {t("onboarding.complete.title", "You're All Set!")}
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {t(
              "onboarding.complete.desc",
              "Everything is configured. You can now start adding books, discussing them with AI, and translating texts seamlessly.",
            )}
          </p>
        </div>
      </div>
    </OnboardingLayout>
  );
}
