import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterExistingPaths,
  loadWorkspaceConfig,
  repoRoot,
  resolveInputPath,
  workspaceBundleDir,
  workspaceEvidenceFiles,
  workspaceRelease,
  workspaceRecordPath,
  workspaceReviewer,
} from "./acceptance-workspace.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(scriptDir, "..");

function parseArgs(argv) {
  const options = {
    recordPath: undefined,
    evidencePaths: [],
    workspacePath: undefined,
    outputDir: undefined,
    reviewer: undefined,
    release: undefined,
    manifestName: "final-manifest.json",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--record") {
      options.recordPath = next;
      index += 1;
    } else if (arg === "--evidence") {
      options.evidencePaths.push(next);
      index += 1;
    } else if (arg === "--workspace") {
      options.workspacePath = next;
      index += 1;
    } else if (arg === "--output-dir") {
      options.outputDir = next;
      index += 1;
    } else if (arg === "--reviewer") {
      options.reviewer = next;
      index += 1;
    } else if (arg === "--release") {
      options.release = next;
      index += 1;
    } else if (arg === "--manifest-name") {
      options.manifestName = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return `ReadAny acceptance assembler

Usage:
  pnpm --filter @readany/cli acceptance:assemble -- --record <record.md> --evidence <evidence.json>... --output-dir <bundle-dir>

Options:
  --record <path>         Final M5 acceptance Markdown record.
  --evidence <path>       Acceptance evidence JSON; repeatable.
  --workspace <path>      Acceptance workspace root or workspace.json.
  --output-dir <path>     Target acceptance bundle directory. Writes <output-dir>/final-manifest.json and bundle files.
  --reviewer <name>       Reviewer name.
  --release <label>       Release or build label.
  --manifest-name <name>  Intermediate manifest filename before bundling. Default: final-manifest.json
`;
}

function assertOption(condition, message) {
  if (!condition) throw new Error(message);
}

function runNodeScript(scriptName, args) {
  return spawnSync(process.execPath, [resolve(scriptDir, scriptName), ...args], {
    cwd: cliRoot,
    env: process.env,
    encoding: "utf8",
  });
}

function commandOutput(result, fallback) {
  if (result.error) {
    return result.error.message || fallback;
  }
  return result.stderr || result.stdout || fallback;
}

async function annotateAssembledManifest(manifestPath, verifyResult) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.bundle = {
    verified: true,
    verifiedAt: new Date().toISOString(),
    verification: verifyResult,
    indexPath: "index.json",
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  let workspaceFile;
  let workspace;
  if (options.workspacePath) {
    const loaded = await loadWorkspaceConfig(options.workspacePath);
    workspaceFile = loaded.workspaceFile;
    workspace = loaded.workspace;
    if (!options.reviewer) {
      options.reviewer = workspaceReviewer(workspace);
    }
    if (!options.release) {
      options.release = workspaceRelease(workspace);
    }
  }

  const recordPath = options.recordPath
    ? resolveInputPath(options.recordPath)
    : workspaceRecordPath(workspace);
  const evidencePathInputs = options.evidencePaths.length > 0
    ? options.evidencePaths
    : workspaceEvidenceFiles(workspace);
  const resolvedEvidencePaths = evidencePathInputs.map(resolveInputPath);
  const evidencePaths = options.evidencePaths.length > 0
    ? resolvedEvidencePaths
    : await filterExistingPaths(resolvedEvidencePaths);
  const outputDir = options.outputDir
    ? resolveInputPath(options.outputDir)
    : workspaceBundleDir(workspace);

  assertOption(recordPath, "Pass --record <path> or --workspace <path>.");
  assertOption(evidencePaths.length > 0, "Pass at least one --evidence <path> or provide evidence files through --workspace <path>.");
  assertOption(outputDir, "Pass --output-dir <path> or use --workspace <path> with outputs.bundleDir.");

  const manifestPath = join(outputDir, options.manifestName);

  const finalize = runNodeScript("finalize-acceptance.mjs", [
    "--record",
    recordPath,
    ...evidencePaths.flatMap((path) => ["--evidence", path]),
    ...(options.reviewer ? ["--reviewer", options.reviewer] : []),
    ...(options.release ? ["--release", options.release] : []),
    "--output",
    manifestPath,
  ]);
  if (finalize.status !== 0) {
    process.stderr.write(commandOutput(finalize, "acceptance:finalize failed.\n"));
    process.exitCode = 1;
    return;
  }

  const bundle = runNodeScript("acceptance-bundle.mjs", [
    "--record",
    recordPath,
    "--manifest",
    manifestPath,
    ...evidencePaths.flatMap((path) => ["--evidence", path]),
    ...(options.release ? ["--release", options.release] : []),
    "--output-dir",
    outputDir,
  ]);
  if (bundle.status !== 0) {
    process.stderr.write(commandOutput(bundle, "acceptance:bundle failed.\n"));
    process.exitCode = 1;
    return;
  }

  const verify = runNodeScript("verify-acceptance-bundle.mjs", [
    "--bundle-dir",
    outputDir,
  ]);
  if (verify.status !== 0) {
    process.stderr.write(commandOutput(verify, "acceptance:verify-bundle failed.\n"));
    process.exitCode = 1;
    return;
  }

  const verifyResult = JSON.parse(verify.stdout || "{}");
  await annotateAssembledManifest(manifestPath, verifyResult);
  const rebundle = runNodeScript("acceptance-bundle.mjs", [
    "--record",
    recordPath,
    "--manifest",
    manifestPath,
    ...evidencePaths.flatMap((path) => ["--evidence", path]),
    ...(options.release ? ["--release", options.release] : []),
    "--output-dir",
    outputDir,
  ]);
  if (rebundle.status !== 0) {
    process.stderr.write(commandOutput(rebundle, "acceptance:bundle failed after manifest annotation.\n"));
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        workspaceFile,
        outputDir,
        manifestPath,
        verified: true,
        evidenceCount: verifyResult.evidenceCount,
      },
      null,
      2,
    )}\n`,
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
