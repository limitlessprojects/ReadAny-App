import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const templatePath = resolve(repoRoot, "docs/readany-cli/acceptance/TEMPLATE.md");

function parseArgs(argv) {
  const options = {
    workspacePath: resolve(process.cwd(), "readany-cli-acceptance"),
    milestone: "M5 acceptance draft",
    reviewer: "TBD",
    release: "TBD",
    desktopPackage: "TBD",
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--workspace") {
      options.workspacePath = next;
      index += 1;
    } else if (arg === "--milestone") {
      options.milestone = next;
      index += 1;
    } else if (arg === "--reviewer") {
      options.reviewer = next;
      index += 1;
    } else if (arg === "--release") {
      options.release = next;
      index += 1;
    } else if (arg === "--desktop-package") {
      options.desktopPackage = next;
      index += 1;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return `ReadAny acceptance workspace bootstrap

Usage:
  pnpm --filter @readany/cli acceptance:init -- [options]

Options:
  --workspace <path>        Workspace root to create.
  --milestone <name>       Default milestone label for scaffolded records.
  --reviewer <name>        Default reviewer for scaffold/finalize/assemble.
  --release <label>        Default release/build label for finalize/bundle/assemble.
  --desktop-package <src>  Default desktop package source label for scaffolded records.
  --json                    Print machine-readable output.
`;
}

function resolveInputPath(path) {
  if (isAbsolute(path)) return path;
  const fromCwd = resolve(process.cwd(), path);
  if (process.cwd() !== repoRoot && path.startsWith("docs/")) {
    return resolve(repoRoot, path);
  }
  return fromCwd;
}

async function pathExists(path) {
  try {
    await mkdir(path, { recursive: false });
    return false;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      return true;
    }
    throw error;
  }
}

async function ensureDirectory(path, createdDirectories) {
  const existed = await pathExists(path);
  if (!existed) {
    createdDirectories.push(path);
  }
}

async function writeIfMissing(path, content, createdFiles) {
  try {
    await readFile(path, "utf8");
    return false;
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  await writeFile(path, content, "utf8");
  createdFiles.push(path);
  return true;
}

function renderWorkspaceReadme(paths, defaults) {
  return `# ReadAny Acceptance Workspace

Workspace root:

\`${paths.workspacePath}\`

Generated structure:

- \`${paths.recordPath}\`
- \`${paths.evidenceDir}\`
- \`${paths.bundleDir}\`
- \`${paths.exportsDir}\`
- \`${paths.logsDir}\`

Suggested evidence files:

- \`${paths.evidenceDir}/real-sample.json\`
- \`${paths.evidenceDir}/agent-codex.json\`
- \`${paths.evidenceDir}/agent-second-client.json\`
- \`${paths.evidenceDir}/desktop-settings.json\`
- \`${paths.evidenceDir}/packaged-macos.json\`
- \`${paths.evidenceDir}/packaged-windows.json\`
- \`${paths.evidenceDir}/packaged-linux.json\`

Workspace defaults:

- milestone: \`${defaults.milestone}\`
- reviewer: \`${defaults.reviewer}\`
- release: \`${defaults.release}\`
- desktopPackage: \`${defaults.desktopPackage}\`

Next commands:

\`\`\`bash
pnpm --filter @readany/cli acceptance:real -- --workspace ${paths.workspacePath} --book <book-id> --rag-query <query>
pnpm --filter @readany/cli acceptance:agent -- --workspace ${paths.workspacePath} --client Codex --client-version <version> --profile readonly/editor/publisher
pnpm --filter @readany/cli acceptance:desktop -- --workspace ${paths.workspacePath} --snapshot <snapshot.json> --screenshot <screenshot-or-recording>
pnpm --filter @readany/cli acceptance:packaged -- --workspace ${paths.workspacePath} --package-source <artifact> --platform macOS
pnpm --filter @readany/cli acceptance:status -- --workspace ${paths.workspacePath}
\`\`\`
`;
}

function renderWorkspaceJson(paths, defaults) {
  return `${JSON.stringify(
    {
      workspacePath: paths.workspacePath,
      paths: {
        recordPath: paths.recordPath,
        evidenceDir: paths.evidenceDir,
        bundleDir: paths.bundleDir,
        exportsDir: paths.exportsDir,
        logsDir: paths.logsDir,
      },
      evidenceFiles: {
        realSample: resolve(paths.evidenceDir, "real-sample.json"),
        agentCodex: resolve(paths.evidenceDir, "agent-codex.json"),
        agentSecondClient: resolve(paths.evidenceDir, "agent-second-client.json"),
        desktopSettings: resolve(paths.evidenceDir, "desktop-settings.json"),
        packagedMacos: resolve(paths.evidenceDir, "packaged-macos.json"),
        packagedWindows: resolve(paths.evidenceDir, "packaged-windows.json"),
        packagedLinux: resolve(paths.evidenceDir, "packaged-linux.json"),
      },
      outputs: {
        finalManifestPath: resolve(paths.workspacePath, "final-manifest.json"),
        bundleDir: paths.bundleDir,
      },
      defaults: {
        milestone: defaults.milestone,
        reviewer: defaults.reviewer,
        release: defaults.release,
        desktopPackage: defaults.desktopPackage,
      },
    },
    null,
    2,
  )}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const workspacePath = resolveInputPath(options.workspacePath);
  const evidenceDir = resolve(workspacePath, "evidence");
  const bundleDir = resolve(workspacePath, "bundle");
  const exportsDir = resolve(workspacePath, "exports");
  const logsDir = resolve(workspacePath, "logs");
  const paths = {
    workspacePath,
    recordPath: resolve(workspacePath, "record.md"),
    evidenceDir,
    bundleDir,
    exportsDir,
    logsDir,
  };
  const defaults = {
    milestone: options.milestone,
    reviewer: options.reviewer,
    release: options.release,
    desktopPackage: options.desktopPackage,
  };

  const createdDirectories = [];
  for (const path of [workspacePath, evidenceDir, bundleDir, exportsDir, logsDir]) {
    await ensureDirectory(path, createdDirectories);
  }

  const template = await readFile(templatePath, "utf8");
  const createdFiles = [];
  await writeIfMissing(paths.recordPath, template, createdFiles);
  await writeIfMissing(resolve(workspacePath, "README.md"), renderWorkspaceReadme(paths, defaults), createdFiles);
  await writeIfMissing(resolve(workspacePath, "workspace.json"), renderWorkspaceJson(paths, defaults), createdFiles);

  const output = {
    ok: true,
    workspacePath,
    paths,
    createdDirectories,
    createdFiles,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write(
      `Workspace ready at ${workspacePath}\nCreated ${createdDirectories.length} directory(s) and ${createdFiles.length} file(s).\n`,
    );
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
