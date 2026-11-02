import { build } from "esbuild";
import { chmod, copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const outDir = resolve(rootDir, "dist");
const outFile = resolve(outDir, "bin/readany.js");

await rm(outDir, { recursive: true, force: true });

await build({
  entryPoints: [resolve(rootDir, "src/bin/readany.ts")],
  outdir: outDir,
  entryNames: "bin/readany",
  chunkNames: "chunks/[name]-[hash]",
  bundle: true,
  splitting: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  external: ["better-sqlite3"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});

await mkdir(resolve(rootDir, "dist/bin"), { recursive: true });
await chmod(outFile, 0o755);

const pdfWorkerPath = fileURLToPath(import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"));
await mkdir(resolve(outDir, "chunks"), { recursive: true });
await copyFile(pdfWorkerPath, resolve(outDir, "chunks/pdf.worker.mjs"));
