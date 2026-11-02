import { constants } from "node:fs";
import { access, lstat, readFile, readlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isManagedShim, resolveShimPath } from "./install.js";
import type { CliPaths } from "./paths.js";
import type { AccessProfile } from "./profiles.js";
import { getSkillStatus } from "./skill.js";
import { listTools } from "./tool-registry.js";
import { CLI_VERSION } from "./version.js";

export type DoctorCheck = {
  name: string;
  ok: boolean;
  message: string;
};

export type DoctorReport = {
  version: string;
  profile: AccessProfile;
  paths: CliPaths;
  runtime: {
    node: string;
    executable: string;
    nativeSqliteAvailable: boolean;
    nativeSqlitePath?: string;
  };
  distribution: {
    kind: "node-script";
    usesNodeRuntime: boolean;
    nativeBinary: boolean;
    entrypoint?: string;
    modulePath: string;
    bundleRoot?: string;
    builtBundle: boolean;
    desktopResourceBundle: boolean;
  };
  tools: {
    count: number;
  };
  mcp: {
    defaultProfile: AccessProfile;
    serveArgs: string[];
    supportedProfiles: AccessProfile[];
    supportedClients: string[];
    toolCount: number;
  };
  agentAccess: {
    cliShim: {
      path: string;
      installed: boolean;
      target?: string;
      managed: boolean;
    };
    skill: {
      installed: boolean;
      path: string;
      version?: string;
    };
    clientSkills: Array<{
      client: "agents" | "codex" | "claude" | "cursor" | "opencode";
      path: string;
      installed: boolean;
      managed: boolean;
      target?: string;
    }>;
    mcpConfigs: Array<{
      client: "codex" | "claude" | "cursor" | "opencode";
      path: string;
      configured: boolean;
      checked: boolean;
    }>;
  };
  checks: DoctorCheck[];
};

type ClientSkillClient = "agents" | "codex" | "claude" | "cursor" | "opencode";
type McpConfigClient = "codex" | "claude" | "cursor" | "opencode";

const CLIENT_SKILL_CLIENTS: ClientSkillClient[] = [
  "agents",
  "codex",
  "claude",
  "cursor",
  "opencode",
];

const MCP_CONFIG_CLIENTS: McpConfigClient[] = ["codex", "claude", "cursor", "opencode"];

async function canAccess(path: string, mode: number): Promise<boolean> {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function resolveNativeSqlite() {
  try {
    return import.meta.resolve("better-sqlite3");
  } catch {
    return undefined;
  }
}

function normalizePath(path: string): string {
  return path.split(/[\\/]+/).join(sep);
}

function createDistributionEvidence(): DoctorReport["distribution"] {
  const modulePath = fileURLToPath(import.meta.url);
  const entrypoint = process.argv[1] ? resolve(process.argv[1]) : undefined;
  const normalizedModulePath = normalizePath(modulePath);
  const normalizedEntrypoint = entrypoint ? normalizePath(entrypoint) : undefined;
  const builtBundle =
    normalizedModulePath.includes(`${sep}dist${sep}`) ||
    normalizedEntrypoint?.endsWith(`${sep}dist${sep}bin${sep}readany.js`) === true ||
    normalizedEntrypoint?.endsWith(`${sep}readany-cli${sep}bin${sep}readany.js`) === true;
  const desktopResourceBundle =
    normalizedEntrypoint?.endsWith(`${sep}readany-cli${sep}bin${sep}readany.js`) === true;

  return {
    kind: "node-script",
    usesNodeRuntime: true,
    nativeBinary: false,
    entrypoint,
    modulePath,
    bundleRoot: entrypoint ? dirname(dirname(entrypoint)) : undefined,
    builtBundle,
    desktopResourceBundle,
  };
}

function getClientSkillPath(client: ClientSkillClient): string {
  const home = homedir();
  if (client === "agents") {
    return join(
      process.env.AGENTS_HOME ? resolve(process.env.AGENTS_HOME) : join(home, ".agents"),
      "skills",
      "readany",
    );
  }
  if (client === "codex") {
    return join(
      process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : join(home, ".codex"),
      "skills",
      "readany",
    );
  }
  if (client === "claude") {
    return join(
      process.env.CLAUDE_HOME ? resolve(process.env.CLAUDE_HOME) : join(home, ".claude"),
      "skills",
      "readany",
    );
  }
  if (client === "cursor") {
    return join(
      process.env.CURSOR_HOME ? resolve(process.env.CURSOR_HOME) : join(home, ".cursor"),
      "skills",
      "readany",
    );
  }
  const opencodeHome = process.env.OPENCODE_HOME
    ? resolve(process.env.OPENCODE_HOME)
    : join(
        process.env.XDG_CONFIG_HOME ? resolve(process.env.XDG_CONFIG_HOME) : join(home, ".config"),
        "opencode",
      );
  return join(opencodeHome, "skills", "readany");
}

function getMcpConfigPath(client: McpConfigClient): string {
  const home = homedir();
  if (client === "codex") {
    return join(
      process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : join(home, ".codex"),
      "config.toml",
    );
  }
  if (client === "claude") {
    return join(
      process.env.CLAUDE_HOME ? resolve(process.env.CLAUDE_HOME) : join(home, ".claude"),
      "claude_desktop_config.json",
    );
  }
  if (client === "cursor") {
    return join(
      process.env.CURSOR_HOME ? resolve(process.env.CURSOR_HOME) : join(home, ".cursor"),
      "mcp.json",
    );
  }
  const opencodeHome = process.env.OPENCODE_HOME
    ? resolve(process.env.OPENCODE_HOME)
    : join(
        process.env.XDG_CONFIG_HOME ? resolve(process.env.XDG_CONFIG_HOME) : join(home, ".config"),
        "opencode",
      );
  return join(opencodeHome, "opencode.json");
}

async function readManagedSkillState(path: string): Promise<{
  installed: boolean;
  managed: boolean;
  target?: string;
}> {
  if (!(await pathExists(path))) return { installed: false, managed: false };
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) {
    const target = await readlink(path);
    const skillStatus = await getSkillStatus(join(path, "SKILL.md"));
    return { installed: true, managed: skillStatus.installed, target };
  }
  const skillStatus = await getSkillStatus(join(path, "SKILL.md"));
  return { installed: true, managed: skillStatus.installed };
}

async function createAgentAccessEvidence(
  paths: CliPaths,
  skillStatus: Awaited<ReturnType<typeof getSkillStatus>>,
): Promise<DoctorReport["agentAccess"]> {
  const cliShimPath = resolveShimPath({ binPath: paths.binPath, mode: "user" }).path;
  const cliShimInstalled = await pathExists(cliShimPath);
  const cliShimStat = cliShimInstalled ? await lstat(cliShimPath) : undefined;
  const cliShimTarget = cliShimStat?.isSymbolicLink() ? await readlink(cliShimPath) : undefined;
  const cliShimManaged = cliShimInstalled
    ? await isManagedShim(cliShimPath, paths.binPath)
    : false;

  const clientSkills = await Promise.all(
    CLIENT_SKILL_CLIENTS.map(async (client) => {
      const path = getClientSkillPath(client);
      return {
        client,
        path,
        ...(await readManagedSkillState(path)),
      };
    }),
  );

  const mcpConfigs = await Promise.all(
    MCP_CONFIG_CLIENTS.map(async (client) => {
      const path = getMcpConfigPath(client);
      try {
        const text = await readFile(path, "utf8");
        return {
          client,
          path,
          checked: true,
          configured: text.includes("readany") && text.includes("mcp"),
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { client, path, checked: false, configured: false };
        }
        return { client, path, checked: false, configured: false };
      }
    }),
  );

  return {
    cliShim: {
      path: cliShimPath,
      installed: cliShimInstalled,
      target: cliShimTarget,
      managed: cliShimManaged,
    },
    skill: {
      installed: skillStatus.installed,
      path: skillStatus.path,
      version: skillStatus.version,
    },
    clientSkills,
    mcpConfigs,
  };
}

export async function runDoctor(paths: CliPaths, profile: AccessProfile): Promise<DoctorReport> {
  const skillStatus = await getSkillStatus(paths.skillFile);
  const agentAccess = await createAgentAccessEvidence(paths, skillStatus);
  const readanyHomeWritable = await canAccess(paths.readanyHome, constants.W_OK);
  const nativeSqlitePath = resolveNativeSqlite();
  const toolCount = listTools().length;

  return {
    version: CLI_VERSION,
    profile,
    paths,
    runtime: {
      node: process.version,
      executable: process.execPath,
      nativeSqliteAvailable: Boolean(nativeSqlitePath),
      nativeSqlitePath,
    },
    distribution: createDistributionEvidence(),
    tools: {
      count: toolCount,
    },
    mcp: {
      defaultProfile: "readonly",
      serveArgs: ["mcp", "serve", "--profile", "readonly"],
      supportedProfiles: ["readonly", "assistant", "editor", "publisher"],
      supportedClients: ["generic", "claude", "cursor", "codex", "opencode"],
      toolCount,
    },
    agentAccess,
    checks: [
      {
        name: "node-runtime",
        ok: true,
        message: `Node runtime is available at ${process.execPath} (${process.version}).`,
      },
      {
        name: "native-sqlite",
        ok: Boolean(nativeSqlitePath),
        message: nativeSqlitePath
          ? "better-sqlite3 is resolvable for library and MCP data commands."
          : "better-sqlite3 is not resolvable; management commands may work, but library and MCP data commands will fail.",
      },
      {
        name: "readany-home",
        ok: readanyHomeWritable,
        message: readanyHomeWritable
          ? "ReadAny home is writable."
          : "ReadAny home is not writable.",
      },
      {
        name: "skill",
        ok: skillStatus.installed,
        message: skillStatus.installed
          ? `ReadAny skill is installed at ${skillStatus.path}.`
          : `ReadAny skill is not installed at ${skillStatus.path}.`,
      },
    ],
  };
}
