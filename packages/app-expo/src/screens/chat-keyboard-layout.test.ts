import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const chatScreens = ["ChatScreen.tsx", "BookChatScreen.tsx"] as const;

describe("Android chat keyboard layout", () => {
  for (const screen of chatScreens) {
    it(`${screen} keeps ChatInput inside Android keyboard avoidance`, () => {
      const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), screen), "utf8");

      expect(source).toMatch(
        /import\s+\{\s*KeyboardAvoidingView\s*\}\s+from\s+"react-native-keyboard-controller";/,
      );
      expect(source).toMatch(
        /<KeyboardAvoidingView\b[\s\S]*?behavior="height"[\s\S]*?enabled=\{Platform\.OS === "android"\}[\s\S]*?keyboardVerticalOffset=\{insets\.top\}[\s\S]*?<ChatInput\b[\s\S]*?<\/KeyboardAvoidingView>/,
      );
    });
  }
});
