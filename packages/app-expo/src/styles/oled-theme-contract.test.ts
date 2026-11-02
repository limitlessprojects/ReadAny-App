import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("OLED Black mobile theme", () => {
  it("defines, restores, and maps OLED as a dark theme with a pure-black background", () => {
    const context = read("packages/app-expo/src/styles/ThemeContext.tsx");
    const app = read("packages/app-expo/src/App.tsx");

    expect(context).toContain('export type ThemeMode = "light" | "dark" | "sepia" | "oled"');
    expect(context).toMatch(
      /const oledColors: ThemeColors = \{[\s\S]*?\.\.\.darkColors,[\s\S]*?background: "#000000"/,
    );
    expect(context).toMatch(/oled: oledColors/);
    expect(context).toMatch(/saved === "oled"/);
    expect(context).toContain('isDark: mode === "dark" || mode === "oled"');
    expect(app).toContain('<StatusBar style={isDark ? "light" : "dark"} />');
  });

  it("offers OLED in both phone-safe theme pickers and every settings locale", () => {
    const settings = read("packages/app-expo/src/screens/settings/AppearanceSettingsScreen.tsx");
    const onboarding = read("packages/app-expo/src/components/onboarding/steps/AppearancePage.tsx");

    for (const source of [settings, onboarding]) {
      expect(source).toMatch(/id: "oled"/);
      expect(source).toMatch(/flexWrap: "wrap"/);
      expect(source).toMatch(/width: "48%"/);
    }

    const labels = {
      en: "OLED Black",
      es: "Negro OLED",
      fr: "Noir OLED",
      ja: "OLEDブラック",
      ko: "OLED 블랙",
      zh: "OLED 纯黑",
      "zh-TW": "OLED 純黑",
    } as const;

    for (const [locale, label] of Object.entries(labels)) {
      const messages = JSON.parse(
        read(`packages/core/src/i18n/locales/${locale}/settings.json`),
      ) as { settings: Record<string, string> };
      expect(messages.settings.oled).toBe(label);
    }
  });

  it("carries OLED into the generated reader and treats PDFs as true black", () => {
    const bridge = read("packages/app-expo/src/hooks/use-reader-bridge.ts");
    const template = read("packages/app-expo/assets/reader/reader.template.html");
    const built = read("packages/app-expo/assets/reader/reader.html");

    expect(bridge).toContain('themeMode?: "light" | "dark" | "sepia" | "oled"');
    for (const source of [template, built]) {
      expect(source).toContain("themeMode === 'oled'");
      expect(source).toMatch(/oled:\s*'invert\(1\)'/);
    }
  });
});
