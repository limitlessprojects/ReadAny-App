import { DesktopWindowControls } from "@/components/layout/DesktopWindowControls";
import { useSettingsStore } from "@readany/core/stores/settings-store";
import { useEffect, useRef, useState } from "react";
import { AIPage } from "./steps/AIPage";
import { AppearancePage } from "./steps/AppearancePage";
import { CompletePage } from "./steps/CompletePage";
import { EmbeddingPage } from "./steps/EmbeddingPage";
import { SyncPage } from "./steps/SyncPage";
import { TranslationPage } from "./steps/TranslationPage";
import { WelcomePage } from "./steps/WelcomePage";

// Moved getIllustrationForStep logic into OnboardingLayout directly

const STEPS = [
  WelcomePage,
  AppearancePage,
  AIPage,
  EmbeddingPage,
  TranslationPage,
  SyncPage,
  CompletePage,
];

export function OnboardingModal() {
  const [step, setStep] = useState(0);
  const { _hasHydrated, hasCompletedOnboarding, showOnboardingGuide, completeOnboarding } =
    useSettingsStore();

  const [mounted, setMounted] = useState(false);
  const topBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!_hasHydrated || !mounted) return null;
  if (hasCompletedOnboarding || !showOnboardingGuide) return null;

  const CurrentStepComponent = STEPS[step];

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      completeOnboarding();
      setTimeout(() => {
        import("@/lib/tour").then((m) => m.startTour());
      }, 500); // Wait for DOM layout changes
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background">
      {/* Draggable Top Bar + desktop window controls */}
      <div
        ref={topBarRef}
        className="absolute top-0 left-0 right-0 z-50 flex h-10 items-center justify-end border-b border-border/30 bg-background/65 backdrop-blur-md cursor-grab active:cursor-grabbing"
      >
        <DesktopWindowControls headerRef={topBarRef} />
      </div>

      {/* Decorative ambient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] h-[70%] w-[50%] rounded-full bg-primary/20 mix-blend-multiply blur-[120px] will-change-transform" />
        <div className="absolute -bottom-[20%] -right-[10%] h-[70%] w-[50%] rounded-full bg-blue-500/20 mix-blend-multiply blur-[120px] will-change-transform" />
      </div>

      <div className="relative w-[850px] max-w-[95vw] h-[580px] max-h-[90vh] overflow-hidden rounded-[2rem] border border-border/50 bg-card/90 shadow-2xl backdrop-blur-2xl transition-all duration-500 flex flex-col">
        <CurrentStepComponent
          onNext={handleNext}
          onPrev={handlePrev}
          step={step}
          totalSteps={STEPS.length}
        />
      </div>
    </div>
  );
}
