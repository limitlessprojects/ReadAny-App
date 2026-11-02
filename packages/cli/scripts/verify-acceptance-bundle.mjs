import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  loadWorkspaceConfig,
  repoRoot,
  resolveInputPath,
  workspaceBundleDir,
} from "./acceptance-workspace.mjs";

const cliRoot = resolve(import.meta.dirname, "..");

function parseArgs(argv) {
  const options = {
    bundleDir: undefined,
    workspacePath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--bundle-dir") {
      options.bundleDir = next;
      index += 1;
    } else if (arg === "--workspace") {
      options.workspacePath = next;
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
  return `ReadAny acceptance bundle verifier

Usage:
  pnpm --filter @readany/cli acceptance:verify-bundle -- --bundle-dir <bundle-dir>

Options:
  --bundle-dir <path>   Acceptance bundle directory created by acceptance:bundle or acceptance:assemble.
  --workspace <path>    Acceptance workspace root or workspace.json.
`;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function assertCondition(condition, errors, message) {
  if (!condition) errors.push(message);
}

function runStrictValidation(recordPath, evidencePaths) {
  const result = spawnSync(
    process.execPath,
    [
      resolve(import.meta.dirname, "validate-acceptance.mjs"),
      "--record",
      recordPath,
      ...evidencePaths.flatMap((path) => ["--evidence", path]),
      "--strict-m5",
      "--json",
    ],
    {
      cwd: cliRoot,
      env: process.env,
      encoding: "utf8",
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    result: JSON.parse(result.stdout || "{}"),
  };
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
  }

  const bundleDir = options.bundleDir
    ? resolveInputPath(options.bundleDir)
    : workspaceBundleDir(workspace);
  if (!bundleDir) throw new Error("Pass --bundle-dir <path> or use --workspace <path> with outputs.bundleDir.");
  const indexPath = join(bundleDir, "index.json");
  const recordPath = join(bundleDir, "record.md");
  const manifestPath = join(bundleDir, "manifest.json");

  const indexText = await readFile(indexPath, "utf8");
  const index = JSON.parse(indexText);
  const errors = [];

  assertCondition(index?.ok === true, errors, "Bundle index ok flag must be true.");
  assertCondition(index?.record === "record.md", errors, "Bundle index record target must be record.md.");
  assertCondition(index?.manifest === "manifest.json", errors, "Bundle index manifest target must be manifest.json.");
  assertCondition(Array.isArray(index?.files), errors, "Bundle index files array is required.");
  assertCondition(Array.isArray(index?.evidences), errors, "Bundle index evidences array is required.");

  const files = Array.isArray(index?.files) ? index.files : [];
  const fileByTarget = new Map(files.map((item) => [item.target, item]));
  const requiredTargets = ["record.md", "manifest.json"];
  for (const target of requiredTargets) {
    assertCondition(fileByTarget.has(target), errors, `Bundle index is missing ${target}.`);
  }

  const recordText = await readFile(recordPath, "utf8");
  const manifestText = await readFile(manifestPath, "utf8");
  const recordInfo = fileByTarget.get("record.md");
  const manifestInfo = fileByTarget.get("manifest.json");
  if (recordInfo) {
    assertCondition(recordInfo.sha256 === sha256(recordText), errors, "Bundle record sha256 does not match.");
    assertCondition(recordInfo.bytes === Buffer.byteLength(recordText), errors, "Bundle record bytes do not match.");
  }
  if (manifestInfo) {
    assertCondition(manifestInfo.sha256 === sha256(manifestText), errors, "Bundle manifest sha256 does not match.");
    assertCondition(manifestInfo.bytes === Buffer.byteLength(manifestText), errors, "Bundle manifest bytes do not match.");
  }

  const manifest = JSON.parse(manifestText);
  const manifestEvidences = Array.isArray(manifest?.evidences) ? manifest.evidences : [];
  const indexEvidenceBySource = new Map((index?.evidences ?? []).map((item) => [item.source, item]));
  const fileEntryBySource = new Map(files.map((item) => [item.source, item]));
  const bundledEvidencePaths = [];

  for (const manifestEvidence of manifestEvidences) {
    const indexEvidence = indexEvidenceBySource.get(manifestEvidence.path);
    assertCondition(Boolean(indexEvidence), errors, `Bundle index evidences is missing ${manifestEvidence.path}.`);
    if (!indexEvidence) continue;
    const target = indexEvidence.target;
    bundledEvidencePaths.push(join(bundleDir, target));
    const bundleEvidenceText = await readFile(join(bundleDir, target), "utf8");
    const fileEntry = fileEntryBySource.get(manifestEvidence.path);
    assertCondition(Boolean(fileEntry), errors, `Bundle files is missing ${manifestEvidence.path}.`);
    if (fileEntry) {
      assertCondition(fileEntry.target === target, errors, `Bundle file target mismatch for ${manifestEvidence.path}.`);
      assertCondition(fileEntry.sha256 === sha256(bundleEvidenceText), errors, `Bundle evidence sha256 does not match ${manifestEvidence.path}.`);
      assertCondition(fileEntry.bytes === Buffer.byteLength(bundleEvidenceText), errors, `Bundle evidence bytes do not match ${manifestEvidence.path}.`);
      assertCondition(fileEntry.sha256 === manifestEvidence.sha256, errors, `Manifest evidence sha256 does not match bundle for ${manifestEvidence.path}.`);
      assertCondition(fileEntry.bytes === manifestEvidence.bytes, errors, `Manifest evidence bytes do not match bundle for ${manifestEvidence.path}.`);
    }
  }

  assertCondition(manifest?.record?.sha256 === recordInfo?.sha256, errors, "Manifest record sha256 does not match bundle record.");
  assertCondition(manifest?.record?.bytes === recordInfo?.bytes, errors, "Manifest record bytes do not match bundle record.");

  if (errors.length > 0) {
    process.stderr.write(`Acceptance bundle verification failed:\n- ${errors.join("\n- ")}\n`);
    process.exitCode = 1;
    return;
  }

  const strictValidation = runStrictValidation(recordPath, bundledEvidencePaths);
  if (strictValidation.status !== 0 || strictValidation.result?.ok !== true) {
    process.stderr.write(
      `Acceptance bundle strict verification failed:\n${strictValidation.stdout || strictValidation.stderr}`,
    );
    process.exitCode = 1;
    return;
  }

  if (manifest?.bundle) {
    assertCondition(manifest.bundle.verified === true, errors, "Manifest bundle.verified must be true when present.");
    assertCondition(manifest.bundle.indexPath === "index.json", errors, "Manifest bundle indexPath must be index.json.");
    assertCondition(
      manifest.bundle.verification?.ok === true,
      errors,
      "Manifest bundle verification.ok must be true when present.",
    );
    assertCondition(
      manifest.bundle.verification?.strictM5?.ok === true,
      errors,
      "Manifest bundle verification.strictM5.ok must be true when present.",
    );
    assertCondition(
      manifest.bundle.verification?.strictM5?.strictM5 === true,
      errors,
      "Manifest bundle verification.strictM5.strictM5 must be true when present.",
    );
    assertCondition(
      manifest.bundle.verification?.evidenceCount === strictValidation.result.evidenceCount,
      errors,
      "Manifest bundle verification evidenceCount must match the current verification result.",
    );
    assertCondition(
      manifest.bundle.verification?.bundleDir === bundleDir,
      errors,
      "Manifest bundle verification bundleDir must match the current bundle directory.",
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        workspaceFile,
        bundleDir,
        recordPath,
        manifestPath,
        evidenceCount: manifestEvidences.length,
        strictM5: strictValidation.result,
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
