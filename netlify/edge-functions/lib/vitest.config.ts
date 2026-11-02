import { defineConfig } from "vitest/config";

// IMPORTANT: this config must live inside lib/ (a subdirectory), never at the
// top level of netlify/edge-functions/. Netlify auto-packages EVERY top-level
// .ts file in that directory as an edge function; a config here once dragged
// vitest/rollup into the edge bundler and failed every production deploy
// ("Cannot find module @rollup/rollup-linux-x64-gnu").
//
// Tests for the Netlify edge provider proxy. The proxy source is
// runtime-agnostic on purpose (no Deno/Netlify-specific imports), so it runs
// under plain Node here — the same code path the local production simulator
// (scripts/serve-dist.mjs) uses.
// Run with: pnpm test:proxy
export default defineConfig({
  test: {
    environment: "node",
    include: ["*.test.ts"],
  },
});
