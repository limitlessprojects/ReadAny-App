import { defineConfig } from "vitest/config";

// Tests for the Netlify edge provider proxy. The proxy source is
// runtime-agnostic on purpose (no Deno/Netlify-specific imports), so it runs
// under plain Node here — the same code path the local production simulator
// (scripts/serve-dist.mjs) uses.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
