import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import {
  loadWorkspaceConfig,
  resolveInputPath,
  workspacePackagedEvidencePath,
} from "./acceptance-workspace.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(scriptDir, "..");
const defaultBinPath = resolve(cliRoot, "dist/bin/readany.js");

function parseArgs(argv) {
  const options = {
    cli: undefined,
    packageSource: undefined,
    platform: process.platform,
    evidencePath: undefined,
    workspacePath: undefined,
    agentHome: process.env.AGENT_HOME,
    readanyHome: process.env.READANY_HOME,
    withSkillInstall: false,
    repairBinDir: undefined,
    draftExport: false,
    bookId: undefined,
    exportDir: undefined,
    keepDraft: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--cli") {
      options.cli = next;
      index += 1;
    } else if (arg === "--package-source") {
      options.packageSource = next;
      index += 1;
    } else if (arg === "--platform") {
      options.platform = next;
      index += 1;
    } else if (arg === "--evidence") {
      options.evidencePath = next;
      index += 1;
    } else if (arg === "--workspace") {
      options.workspacePath = next;
      index += 1;
    } else if (arg === "--agent-home") {
      options.agentHome = next;
      index += 1;
    } else if (arg === "--readany-home") {
      options.readanyHome = next;
      index += 1;
    } else if (arg === "--with-skill-install") {
      options.withSkillInstall = true;
    } else if (arg === "--repair-bin-dir") {
      options.repairBinDir = next;
      index += 1;
    } else if (arg === "--draft-export") {
      options.draftExport = true;
    } else if (arg === "--book") {
      options.bookId = next;
      index += 1;
    } else if (arg === "--export-dir") {
      options.exportDir = next;
      index += 1;
    } else if (arg === "--keep-draft") {
      options.keepDraft = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return `ReadAny packaged platform acceptance helper

Usage:
  pnpm --filter @readany/cli acceptance:packaged -- --package-source <dmg|msi|appimage|...> [options]

Readonly by default:
  --cli <path>                 CLI executable or built readany.js. Defaults to dist/bin/readany.js.
  --package-source <label>     Package artifact/source label for the platform matrix.
  --platform <name>            Platform label; defaults to process.platform.
  --readany-home <path>        ReadAny data root; defaults to READANY_HOME.
  --evidence <path>            Write JSON evidence to this path.
  --workspace <path>           Acceptance workspace root or workspace.json.

Explicit write mode:
  --repair-bin-dir <path>       Run readany repair --user in this temp bin dir for install/repair evidence.
  --with-skill-install         Run skill install/status/uninstall. Use --agent-home with a temp dir for QA.
  --agent-home <path>          Agent home used by skill commands.
  --draft-export               Run EPUB draft create/validate/export/inspect/discard on this packaged CLI.
  --book <book-id>             EPUB book id used by --draft-export.
  --export-dir <path>          Export target directory used by --draft-export.
  --keep-draft                 Keep the draft workspace after export for manual inspection.
`;
}

function commandForCli(cliPath) {
  if (cliPath.endsWith(".js")) {
    return {
      command: process.execPath,
      argsPrefix: [cliPath],
      display: `${process.execPath} ${cliPath}`,
    };
  }
  return {
    command: cliPath,
    argsPrefix: [],
    display: cliPath,
  };
}

function commandDisplay(cli, args) {
  return ["readany", ...args].join(" ");
}

function summarizeJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value, (_, child) => {
    if (typeof child === "string" && child.length > 500) return `${child.slice(0, 500)}...`;
    return child;
  }));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function decodeXmlText(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function getPackageDir(path) {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index + 1) : "";
}

function resolvePackagePath(packageDir, href) {
  if (!packageDir) return href;
  return `${packageDir}${href}`.replace(/\/{2,}/g, "/");
}

function findEndOfCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minOffset = Math.max(0, bytes.byteLength - 65557);
  for (let offset = bytes.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return {
        entryCount: view.getUint16(offset + 10, true),
        centralDirectoryOffset: view.getUint32(offset + 16, true),
      };
    }
  }
  throw new Error("ZIP end of central directory was not found.");
}

function readZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const eocd = findEndOfCentralDirectory(bytes);
  const entries = new Map();
  let offset = eocd.centralDirectoryOffset;

  for (let index = 0; index < eocd.entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory entry.");
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error(`Invalid ZIP local header for ${name}.`);
    }
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} for ${name}.`);
    }
    entries.set(name, data);

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipText(entries, path) {
  const data =
    entries.get(path) ??
    Array.from(entries.entries()).find(([entryPath]) => entryPath.toLowerCase() === path.toLowerCase())?.[1];
  return data ? new TextDecoder().decode(data) : undefined;
}

function inspectExportedEpub(bytes) {
  const entries = readZipEntries(bytes);
  const containerXml = readZipText(entries, "META-INF/container.xml");
  if (!containerXml) throw new Error("Exported EPUB container.xml was not found.");
  const packagePath = containerXml.match(/<rootfile\b[^>]*\bfull-path=["']([^"']+)["']/i)?.[1];
  if (!packagePath) throw new Error("Exported EPUB container.xml does not declare a package document.");

  const opfXml = readZipText(entries, packagePath);
  if (!opfXml) throw new Error(`Exported EPUB package document was not found: ${packagePath}`);
  const packageDir = getPackageDir(packagePath);
  const title = opfXml.match(/<[^:>]*:?title\b[^>]*>([^<]*)<\/[^>]+>/i)?.[1]?.trim();
  const navHref = opfXml
    .match(/<item\b[^>]*\bproperties=["'][^"']*\bnav\b[^"']*["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i)?.[1] ??
    opfXml.match(/<item\b[^>]*\bhref=["']([^"']+)["'][^>]*\bproperties=["'][^"']*\bnav\b[^"']*["'][^>]*>/i)?.[1];
  const navXml = navHref ? readZipText(entries, resolvePackagePath(packageDir, navHref)) : undefined;

  return {
    packagePath,
    title: title ? decodeXmlText(title) : undefined,
    manifestCount: opfXml.match(/<item\b/gi)?.length ?? 0,
    spineCount: opfXml.match(/<itemref\b/gi)?.length ?? 0,
    tocCount: navXml?.match(/<a\b/gi)?.length ?? 0,
  };
}

function runCli(cli, args, env) {
  const result = spawnSync(cli.command, [...cli.argsPrefix, ...args], {
    cwd: cliRoot,
    env,
    encoding: "utf8",
    shell: process.platform === "win32" && cli.argsPrefix.length === 0,
  });
  let parsed;
  try {
    parsed = result.stdout.trim() ? JSON.parse(result.stdout) : undefined;
  } catch {
    parsed = undefined;
  }
  return {
    command: commandDisplay(cli, args),
    status: result.status,
    ok: result.status === 0 && (parsed?.ok ?? true) !== false,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    parsed,
  };
}

function assertCommand(checks, commands, name, result) {
  commands.push({
    name,
    command: result.command,
    status: result.status,
    ok: result.ok,
    data: summarizeJson(result.parsed?.data),
    error: summarizeJson(result.parsed?.error),
  });
  if (!result.ok) {
    throw new Error(`${name} failed: ${result.stderr || result.stdout || result.status}`);
  }
  checks.push(name);
  return result.parsed?.data ?? result.stdout;
}

function callMcp(cli, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cli.command, [...cli.argsPrefix, "mcp", "serve", "--profile", "readonly"], {
      cwd: cliRoot,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32" && cli.argsPrefix.length === 0,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const stderrText = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(`MCP readonly exited with ${code}: ${stderrText}`));
        return;
      }
      try {
        const responses = Buffer.concat(stdout)
          .toString("utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        resolvePromise({ code, responses, stderr: stderrText });
      } catch (error) {
        reject(error);
      }
    });

    for (const request of [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    ]) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
    }
    child.stdin.end();
  });
}

function createEnvironmentEvidence(options, cliPath) {
  return {
    evidenceType: "packaged-platform",
    platform: options.platform,
    processPlatform: process.platform,
    arch: process.arch,
    node: process.version,
    cliPath,
    packageSource: options.packageSource,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (!options.packageSource) throw new Error("Pass --package-source <label>.");
  if (options.draftExport && !options.bookId) throw new Error("--draft-export requires --book <book-id>.");
  if (options.draftExport && !options.exportDir) throw new Error("--draft-export requires --export-dir <path>.");

  let workspaceFile;
  let workspace;
  if (options.workspacePath) {
    const loaded = await loadWorkspaceConfig(options.workspacePath);
    workspaceFile = loaded.workspaceFile;
    workspace = loaded.workspace;
  }

  const cliPath = resolveInputPath(options.cli ?? defaultBinPath);
  const evidencePath = options.evidencePath
    ? resolveInputPath(options.evidencePath)
    : workspacePackagedEvidencePath(workspace, options.platform);
  const cli = commandForCli(cliPath);
  const env = {
    ...process.env,
    ...(options.readanyHome ? { READANY_HOME: resolveInputPath(options.readanyHome) } : {}),
    ...(options.agentHome ? { AGENT_HOME: resolveInputPath(options.agentHome) } : {}),
  };
  const checks = [];
  const commands = [];

  const version = assertCommand(checks, commands, "version", runCli(cli, ["--version"], env));
  const doctor = assertCommand(checks, commands, "doctor", runCli(cli, ["doctor", "--json"], env));
  const repair = options.repairBinDir
    ? assertCommand(
        checks,
        commands,
        "repair",
        runCli(cli, ["repair", "--user", "--user-bin-dir", resolveInputPath(options.repairBinDir), "--json"], env),
      )
    : undefined;
  assertCommand(checks, commands, "tools.list", runCli(cli, ["tools", "list", "--json"], env));
  assertCommand(checks, commands, "mcp.config.generic", runCli(cli, ["mcp", "config", "--profile", "readonly", "--client", "generic", "--json"], env));
  assertCommand(checks, commands, "mcp.config.codex", runCli(cli, ["mcp", "config", "--profile", "readonly", "--client", "codex", "--json"], env));
  assertCommand(checks, commands, "skill.status", runCli(cli, ["skill", "status", "--json"], env));

  const mcp = await callMcp(cli, env);
  const initialize = mcp.responses[0];
  const toolsList = mcp.responses[1];
  if (initialize?.result?.serverInfo?.name !== "readany") {
    throw new Error("MCP initialize did not return readany serverInfo.");
  }
  if (!Array.isArray(toolsList?.result?.tools) || toolsList.result.tools.length === 0) {
    throw new Error("MCP tools/list returned no tools.");
  }
  checks.push("mcp.initialize.tools.list");
  commands.push({
    name: "mcp.initialize.tools.list",
    command: "readany mcp serve --profile readonly",
    status: mcp.code,
    ok: true,
    data: {
      serverName: initialize.result.serverInfo.name,
      toolCount: toolsList.result.tools.length,
      hasSafetyMetadata: toolsList.result.tools.every((tool) => tool._meta?.["readany/minimumProfile"]),
    },
  });

  let skillInstall;
  if (options.withSkillInstall) {
    assertCommand(checks, commands, "skill.install", runCli(cli, ["skill", "install", "--json"], env));
    skillInstall = assertCommand(checks, commands, "skill.status.afterInstall", runCli(cli, ["skill", "status", "--json"], env));
    assertCommand(checks, commands, "skill.uninstall", runCli(cli, ["skill", "uninstall", "--json"], env));
  }

  let draftExport;
  if (options.draftExport) {
    const exportDir = resolveInputPath(options.exportDir);
    await mkdir(exportDir, { recursive: true });
    const draftCreate = assertCommand(
      checks,
      commands,
      "epub.draft.create",
      runCli(cli, ["epub", "draft", "create", options.bookId, "--profile", "editor", "--json"], env),
    );
    const draftId = draftCreate.draft?.draftId;
    if (!draftId) throw new Error("epub.draft.create did not return draftId.");
    let draftWorkflowFailed = false;
    try {
      const validate = assertCommand(
        checks,
        commands,
        "epub.validate",
        runCli(cli, ["epub", "validate", draftId, "--profile", "publisher", "--json"], env),
      );
      if (validate.validation?.valid !== true) {
        throw new Error("epub.validate did not pass for packaged draft export.");
      }
      const exportPath = join(exportDir, `readany-packaged-${options.platform}-${Date.now()}.epub`);
      assertCommand(
        checks,
        commands,
        "epub.export",
        runCli(cli, ["epub", "export", draftId, "--output", exportPath, "--profile", "publisher", "--json"], env),
      );
      const exportedBytes = await readFile(exportPath);
      const exportedInspect = inspectExportedEpub(exportedBytes);
      if (exportedInspect.spineCount <= 0) {
        throw new Error("Exported packaged EPUB inspect returned no spine items.");
      }
      checks.push("epub.export.inspect");
      draftExport = {
        checked: true,
        bookId: options.bookId,
        draftId,
        outputPath: exportPath,
        outputBytes: exportedBytes.byteLength,
        outputHash: sha256(exportedBytes),
        exportedInspect,
        draftKept: options.keepDraft,
      };
    } catch (error) {
      draftWorkflowFailed = true;
      throw error;
    } finally {
      if (!options.keepDraft) {
        const discard = runCli(
          cli,
          [
            "epub",
            "draft",
            "discard",
            draftId,
            "--profile",
            "editor",
            "--reason",
            "packaged platform acceptance cleanup",
            "--json",
          ],
          env,
        );
        commands.push({
          name: "epub.draft.discard",
          command: discard.command,
          status: discard.status,
          ok: discard.ok,
          data: summarizeJson(discard.parsed?.data),
          error: summarizeJson(discard.parsed?.error),
        });
        checks.push("epub.draft.discard");
        if (!discard.ok && !draftWorkflowFailed) {
          throw new Error(`epub.draft.discard failed: ${discard.stderr || discard.stdout || discard.status}`);
        }
      }
    }
  }

  const evidence = {
    ok: true,
    generatedAt: new Date().toISOString(),
    environment: createEnvironmentEvidence(options, cliPath),
    commandSource: cli.display,
    readanyHome: env.READANY_HOME,
    agentHome: env.AGENT_HOME,
    version,
    doctor,
    repair,
    skillInstall,
    draftExport,
    mcp: {
      serverName: initialize.result.serverInfo.name,
      toolCount: toolsList.result.tools.length,
      hasSafetyMetadata: toolsList.result.tools.every((tool) => tool._meta?.["readany/minimumProfile"]),
    },
    checks,
    commands,
    summary: {
      platform: options.platform,
      packageSource: options.packageSource,
      commandCount: commands.length,
      checkCount: checks.length,
      skillInstallChecked: options.withSkillInstall,
      repairChecked: Boolean(repair),
      builtBundle: doctor.distribution?.builtBundle === true,
      desktopResourceBundle: doctor.distribution?.desktopResourceBundle === true,
      nativeBinary: doctor.distribution?.nativeBinary === true,
      usesNodeRuntime: doctor.distribution?.usesNodeRuntime === true,
      draftExportChecked: draftExport?.checked === true,
    },
    manualAcceptanceRequired: [
      {
        id: "desktop-settings",
        label: "Capture the desktop External AI settings page showing this platform doctor runtime/distribution evidence.",
        evidence: [
          "settings page screenshot for runtime/distribution evidence",
          "CLI repair operation log from packaged app",
          "readonly/editor/publisher MCP config copy confirmation",
        ],
        commands: [
          "readany repair --user --json",
          "readany doctor --json",
          "readany mcp config --client generic --profile readonly --json",
        ],
      },
      {
        id: "draft-export",
        label: "Run a real EPUB draft validate/export flow from the packaged app or installed CLI on this platform.",
        evidence: [
          "real EPUB draft id",
          "validate result",
          "export path and exported EPUB open/reimport result",
        ],
        commands: [
          "readany epub draft create <book-id> --profile editor --json",
          "readany epub validate <draft-id> --profile publisher --json",
          "readany epub export <draft-id> --output <path> --profile publisher --json",
        ],
      },
    ],
  };

  if (evidencePath) {
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    workspaceFile,
    evidencePath,
    summary: evidence.summary,
    manualAcceptanceRequired: evidence.manualAcceptanceRequired.map((item) => item.id),
  }, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
