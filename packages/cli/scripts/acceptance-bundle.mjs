import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterExistingPaths,
  loadWorkspaceConfig,
  repoRoot,
  resolveInputPath,
  workspaceBundleDir,
  workspaceEvidenceFiles,
  workspaceFinalManifestPath,
  workspaceRelease,
  workspaceRecordPath,
} from "./acceptance-workspace.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(scriptDir, "..");

function parseArgs(argv) {
  const options = {
    recordPath: undefined,
    manifestPath: undefined,
    evidencePaths: [],
    workspacePath: undefined,
    outputDir: undefined,
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
    } else if (arg === "--manifest") {
      options.manifestPath = next;
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
  return `ReadAny M5 acceptance bundle exporter

Usage:
  pnpm --filter @readany/cli acceptance:bundle -- --record <record.md> --manifest <manifest.json> --evidence <evidence.json>... --output-dir <bundle-dir>

Options:
  --record <path>       Final M5 acceptance Markdown record.
  --manifest <path>     Final manifest JSON.
  --evidence <path>     Acceptance evidence JSON; repeatable.
  --workspace <path>    Acceptance workspace root or workspace.json.
  --output-dir <path>   Write a bundle directory to this path.
  --release <label>     Release or build label.
`;
}

function assertOption(condition, message) {
  if (!condition) throw new Error(message);
}

function bundleFileName(path, fallback) {
  const value = String(path ?? "").replace(/[\\/]/g, "_").trim();
  return value || fallback;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function parseManifest(text) {
  const manifest = JSON.parse(text);
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Manifest must be a JSON object.");
  }
  return manifest;
}

function assertBundleConsistency({ recordInfo, manifestText, evidenceInfos }) {
  const errors = [];
  const manifest = parseManifest(manifestText);
  const manifestEvidences = Array.isArray(manifest?.evidences) ? manifest.evidences : [];
  const manifestEvidenceByPath = new Map(
    manifestEvidences.map((item) => [item.path, item]),
  );
  const bundleEvidenceByPath = new Map(
    evidenceInfos.map((item) => [item.source, item]),
  );

  if (manifest.ok !== true) errors.push("Manifest ok flag must be true.");
  if (manifest.record?.path !== recordInfo.source) {
    errors.push("Manifest record path does not match record file.");
  }
  if (manifest.record?.sha256 !== recordInfo.sha256) {
    errors.push("Manifest record sha256 does not match record file.");
  }
  if (manifest.record?.bytes !== recordInfo.bytes) {
    errors.push("Manifest record bytes do not match record file.");
  }
  if (manifestEvidences.length !== evidenceInfos.length) {
    errors.push("Manifest evidence count does not match bundle evidence count.");
  }

  for (const evidenceInfo of evidenceInfos) {
    const manifestEvidence = manifestEvidenceByPath.get(evidenceInfo.source);
    if (!manifestEvidence) {
      errors.push(`Manifest is missing evidence entry for ${evidenceInfo.source}.`);
      continue;
    }
    if (manifestEvidence.sha256 !== evidenceInfo.sha256) {
      errors.push(`Manifest evidence sha256 does not match ${evidenceInfo.source}.`);
    }
    if (manifestEvidence.bytes !== evidenceInfo.bytes) {
      errors.push(`Manifest evidence bytes do not match ${evidenceInfo.source}.`);
    }
  }

  for (const manifestEvidence of manifestEvidences) {
    const bundleEvidence = bundleEvidenceByPath.get(manifestEvidence.path);
    if (!bundleEvidence) {
      errors.push(`Bundle evidence is missing ${manifestEvidence.path}.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Acceptance bundle consistency check failed:\n- ${errors.join("\n- ")}`);
  }
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
    if (!options.release) {
      options.release = workspaceRelease(workspace);
    }
  }

  const recordPath = options.recordPath
    ? resolveInputPath(options.recordPath)
    : workspaceRecordPath(workspace);
  const manifestPath = options.manifestPath
    ? resolveInputPath(options.manifestPath)
    : workspaceFinalManifestPath(workspace);
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
  assertOption(manifestPath, "Pass --manifest <path> or use --workspace <path> with outputs.finalManifestPath.");
  assertOption(evidencePaths.length > 0, "Pass at least one --evidence <path> or provide evidence files through --workspace <path>.");
  assertOption(outputDir, "Pass --output-dir <path> or use --workspace <path> with outputs.bundleDir.");
  const evidenceDir = join(outputDir, "evidence");
  await mkdir(evidenceDir, { recursive: true });

  const recordText = await readFile(recordPath, "utf8");
  const manifestText = await readFile(manifestPath, "utf8");
  const recordInfo = {
    source: recordPath,
    target: "record.md",
    sha256: sha256(recordText),
    bytes: Buffer.byteLength(recordText),
  };
  const manifestInfo = {
    source: manifestPath,
    target: "manifest.json",
    sha256: sha256(manifestText),
    bytes: Buffer.byteLength(manifestText),
  };
  const evidenceInfos = await Promise.all(
    evidencePaths.map(async (path, index) => {
      const text = await readFile(path, "utf8");
      return {
        source: path,
        target: `evidence/${bundleFileName(path, `evidence-${index + 1}.json`)}`,
        sha256: sha256(text),
        bytes: Buffer.byteLength(text),
        text,
      };
    }),
  );
  assertBundleConsistency({
    recordInfo,
    manifestText,
    evidenceInfos,
  });
  await writeFile(join(outputDir, "record.md"), recordText, "utf8");
  await writeFile(join(outputDir, "manifest.json"), manifestText, "utf8");
  await writeFile(
    join(outputDir, "index.json"),
      `${JSON.stringify(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        release: options.release,
        record: "record.md",
        manifest: "manifest.json",
        evidences: evidenceInfos.map(({ source, target }) => ({ source, target })),
        files: [recordInfo, manifestInfo, ...evidenceInfos.map(({ source, target, sha256, bytes }) => ({
          source,
          target,
          sha256,
          bytes,
        }))],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  for (const evidenceInfo of evidenceInfos) {
    await writeFile(join(outputDir, evidenceInfo.target), evidenceInfo.text, "utf8");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        workspaceFile,
        outputDir,
        files: [
          "record.md",
          "manifest.json",
          "index.json",
          ...evidencePaths.map((path, index) => `evidence/${bundleFileName(path, `evidence-${index + 1}.json`)}`),
        ],
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
