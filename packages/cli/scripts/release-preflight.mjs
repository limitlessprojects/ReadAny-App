import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const skipRust = process.argv.includes("--skip-rust");
const includeAppBuild = process.argv.includes("--include-app-build");

const steps = [
  {
    name: "CLI typecheck",
    command: "pnpm",
    args: ["--filter", "@readany/cli", "check"],
  },
  {
    name: "CLI tests",
    command: "pnpm",
    args: ["--filter", "@readany/cli", "test"],
  },
  {
    name: "CLI build",
    command: "pnpm",
    args: ["--filter", "@readany/cli", "build"],
  },
  {
    name: "External agent MCP smoke",
    command: "pnpm",
    args: ["--filter", "@readany/cli", "smoke:agent"],
  },
];

if (!skipRust) {
  steps.push(
    {
      name: "Tauri CLI bridge tests",
      command: "cargo",
      args: ["test", "readany_cli::tests", "--", "--nocapture"],
      cwd: resolve(repoRoot, "packages/app/src-tauri"),
    },
    {
      name: "Tauri cargo check",
      command: "cargo",
      args: ["check"],
      cwd: resolve(repoRoot, "packages/app/src-tauri"),
    },
  );
}

if (includeAppBuild) {
  steps.push({
    name: "Desktop app build",
    command: "pnpm",
    args: ["--filter", "app", "build"],
  });
}

for (const step of steps) {
  const cwd = step.cwd ?? repoRoot;
  console.log(`\n==> ${step.name}`);
  console.log(`$ ${step.command} ${step.args.join(" ")}`);
  const result = spawnSync(step.command, step.args, {
    cwd,
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nReadAny CLI release preflight passed.");
