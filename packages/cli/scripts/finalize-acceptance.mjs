import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterExistingPaths,
  loadWorkspaceConfig,
  repoRoot,
  resolveInputPath,
  workspaceEvidenceFiles,
  workspaceFinalManifestPath,
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
    outputPath: undefined,
    reviewer: undefined,
    release: undefined,
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
    } else if (arg === "--output") {
      options.outputPath = next;
      index += 1;
    } else if (arg === "--reviewer") {
      options.reviewer = next;
      index += 1;
    } else if (arg === "--release") {
      options.release = next;
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
  return `ReadAny M5 acceptance finalizer

Usage:
  pnpm --filter @readany/cli acceptance:finalize -- --record <m5-record.md> --evidence <evidence.json>... --output <manifest.json>

Options:
  --record <path>       Final M5 acceptance Markdown record.
  --evidence <path>     Acceptance evidence JSON; repeatable.
  --workspace <path>    Acceptance workspace root or workspace.json.
  --output <path>       Write final manifest JSON to this path.
  --reviewer <name>     Reviewer name.
  --release <label>     Release or build label.
`;
}

function assertOption(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function evidenceType(evidence) {
  return evidence?.environment?.evidenceType === "packaged-platform"
    ? "packaged-platform"
    : evidence?.environment?.evidenceType === "external-agent"
      ? "external-agent"
      : evidence?.environment?.evidenceType === "desktop-settings"
        ? "desktop-settings"
        : "real-sample";
}

function evidenceLabel(evidence) {
  const type = evidenceType(evidence);
  if (type === "external-agent") return evidence.client?.name ?? "external-agent";
  if (type === "packaged-platform") return evidence.environment?.platform ?? "packaged-platform";
  return type;
}

function runMetadataCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) return undefined;
  return result.stdout.trim() || undefined;
}

function runStrictValidation(recordPath, evidencePaths) {
  const args = [
    resolve(scriptDir, "validate-acceptance.mjs"),
    "--record",
    recordPath,
    ...evidencePaths.flatMap((path) => ["--evidence", path]),
    "--strict-m5",
    "--json",
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: cliRoot,
    env: process.env,
    encoding: "utf8",
  });
  const parsed = JSON.parse(result.stdout || "{}");
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    result: parsed,
  };
}

async function readArtifact(path) {
  const text = await readFile(path, "utf8");
  return {
    path,
    sha256: sha256(text),
    bytes: Buffer.byteLength(text),
    text,
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
  const outputPath = options.outputPath
    ? resolveInputPath(options.outputPath)
    : workspaceFinalManifestPath(workspace);

  assertOption(recordPath, "Pass --record <path> or --workspace <path>.");
  assertOption(evidencePaths.length > 0, "Pass at least one --evidence <path> or provide evidence files through --workspace <path>.");
  assertOption(outputPath, "Pass --output <path> or use --workspace <path> with outputs.finalManifestPath.");

  const validation = runStrictValidation(recordPath, evidencePaths);
  if (validation.status !== 0 || validation.result?.ok !== true) {
    process.stderr.write(
      `Strict M5 validation failed; manifest was not written.\n${validation.stdout || validation.stderr}`,
    );
    process.exitCode = 1;
    return;
  }

  const record = await readArtifact(recordPath);
  const evidenceArtifacts = await Promise.all(evidencePaths.map(readArtifact));
  const evidences = evidenceArtifacts.map((artifact) => JSON.parse(artifact.text));
  const manifest = {
    ok: true,
    generatedAt: new Date().toISOString(),
    release: options.release,
    reviewer: options.reviewer,
    git: {
      commit: runMetadataCommand("git", ["rev-parse", "HEAD"]) ?? "unavailable",
      branch: runMetadataCommand("git", ["branch", "--show-current"]) ?? "unavailable",
    },
    record: {
      path: record.path,
      sha256: record.sha256,
      bytes: record.bytes,
    },
    evidences: evidenceArtifacts.map((artifact, index) => ({
      path: artifact.path,
      sha256: artifact.sha256,
      bytes: artifact.bytes,
      type: evidenceType(evidences[index]),
      label: evidenceLabel(evidences[index]),
    })),
    validation: validation.result,
    summary: {
      evidenceCount: evidenceArtifacts.length,
      evidenceTypes: Array.from(new Set(evidences.map(evidenceType))).sort(),
    },
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, workspaceFile, outputPath, summary: manifest.summary }, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
