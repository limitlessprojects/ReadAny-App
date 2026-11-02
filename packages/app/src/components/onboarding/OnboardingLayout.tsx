import type { ReactNode } from "react";

interface OnboardingLayoutProps {
  illustration: string;
  step: number;
  totalSteps: number;
  children: ReactNode;
  footer: ReactNode;
}

export function OnboardingLayout({
  illustration,
  step,
  totalSteps,
  children,
  footer,
}: OnboardingLayoutProps) {
  return (
    <div className="flex h-full w-full flex-col">
      {/* Top section: Two columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Col: Illustration (1/3) */}
        <div className="hidden sm:flex w-[280px] bg-muted/20 px-6 py-10 flex-col items-center justify-center relative border-r border-border/50 shrink-0">
          <img
            key={step}
            src={illustration}
            className="w-full max-h-full dark:invert object-contain animate-in fade-in zoom-in-95 duration-500"
            alt="Step Illustration"
          />
        </div>

        {/* Right Col: Content (2/3) */}
        <div className="flex-1 px-10 py-8 flex flex-col overflow-y-auto invisible-scrollbar">
          {children}
        </div>
      </div>

      {/* Bottom section: Full width Footer */}
      <div className="w-full shrink-0 border-t border-border/50 bg-background/50 h-[88px] px-10 flex items-center relative z-20">
        {/* Action Buttons spanning full width */}
        <div className="w-full flex items-center justify-between z-10">{footer}</div>

        {/* Minimal Progress indicator, centered perfectly across the modal */}
        {step < totalSteps - 1 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <div className="flex items-center gap-2">
              {Array.from({ length: totalSteps - 1 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    i === step
                      ? "w-8 bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                      : i < step
                        ? "w-2 bg-primary/50"
                        : "w-2 bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
