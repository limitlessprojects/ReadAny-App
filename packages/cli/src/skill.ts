import { mkdir, readdir, readFile, rmdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { listTools } from "./tool-registry.js";
import { CLI_VERSION } from "./version.js";

export type SkillStatus = {
  installed: boolean;
  path: string;
  version?: string;
};

export type SkillInstallResult = {
  installed: true;
  path: string;
  version: string;
};

export type SkillUpdateResult = {
  updated: true;
  path: string;
  previousVersion?: string;
  version: string;
};

export type SkillUninstallResult = {
  removed: boolean;
  path: string;
};

const MANAGED_MARKER = "<!-- readany-cli-managed -->";

function renderMcpToolList(): string {
  return listTools()
    .map(
      (tool) =>
        `- \`${tool.name}\` (${tool.risk}; scopes: ${tool.scopes.join(", ")}): ${tool.description}`,
    )
    .join("\n");
}

export function createSkillContent(version = CLI_VERSION): string {
  return `${MANAGED_MARKER}
---
name: readany
description: Use ReadAny CLI and MCP to safely access the user's local ReadAny library, notes, knowledge base, RAG context, and EPUB draft workflows.
---

# ReadAny

Use this skill when the user asks an external AI agent to search, read, organize, or edit content stored in ReadAny.

## Capabilities

- Read book metadata, chapters, highlights, notes, bookmarks, and skills.
- Search ReadAny with metadata, keyword, semantic retrieval, and knowledge tools.
- Read the current reader context snapshot when the desktop client provides one.
- Inspect EPUB structure and use draft-first EPUB editing workflows when an editing profile is enabled.
- Read, patch, batch-patch, rebuild toc, inspect history, diff, undo, validate, discard, and export through ReadAny drafts.
- Export new artifacts only when the active profile allows export.
- Ask the user before high-risk actions.

## Safety Rules

- Start with readonly access unless the user explicitly asks for editing or publishing.
- Never request arbitrary shell, arbitrary SQL, or unrestricted filesystem access.
- Do not overwrite original books; use ReadAny drafts and exports.
- Treat publisher/export actions and draft discard as high-risk; ask the user to confirm in ReadAny.
- Prefer MCP tools in clients that support MCP. Use CLI commands as a transparent fallback.

## Client Setup Notes

- \`all\` setup links this managed skill into all known user skill discovery directories.
- \`codex\`, \`claude\`, \`cursor\`, and \`opencode\` setup link this managed skill into the known client skill directory.
- \`agents\` is a compatibility link under \`~/.agents/skills/readany\` for clients that follow OpenCode's agent-compatible lookup.
- \`generic\` setup only installs the CLI and canonical skill under \`$AGENT_HOME/skills/readany\`.

## MCP Tools

${renderMcpToolList()}

## Commands

\`\`\`bash
readany agent setup --user --client generic --profile readonly --json
readany agent setup --user --client codex --profile readonly --json
readany agent setup --user --client claude --profile readonly --json
readany agent setup --user --client cursor --profile readonly --json
readany agent setup --user --client opencode --profile readonly --json
readany agent setup --user --client all --profile readonly --json
readany doctor --json
readany mcp serve --profile readonly
readany mcp config --profile readonly --client generic --json
readany mcp config --profile readonly --client codex --json
readany mcp config --profile readonly --client claude --json
readany mcp config --profile readonly --client cursor --json
readany mcp config --profile readonly --client opencode --json
readany tools list --json
readany books list --json
readany books search <query> --json
readany book get <book-id> --json
readany chapters list <book-id> --json
readany chapter get <book-id> <chapter-id> --json --limit 12000
readany context get --json --limit 12000
readany bookmarks list <book-id> --json
readany skills list --json
readany notes search <query> --json --book <book-id>
readany highlights search <query> --json --book <book-id>
readany knowledge search <query> --json --book <book-id>
readany rag search <query> --book <book-id> --json
readany epub inspect <book-id> --profile editor --json
readany epub draft create <book-id> --profile editor --json
readany epub chapter read <draft-id> <chapter-id> --format xhtml --profile editor --json
readany epub chapter patch <draft-id> <chapter-id> --xhtml <file> --profile editor --json
readany epub chapters patch <draft-id> --patch <file> --profile editor --json
readany epub metadata patch <draft-id> --patch <file> --profile editor --json
readany epub toc rebuild <draft-id> --profile editor --json
readany epub history <draft-id> --profile editor --json
readany epub diff <draft-id> --profile editor --json
readany epub undo <draft-id> <operation-id> --profile editor --json
readany epub draft discard <draft-id> --profile editor --reason "finished" --json
readany epub validate <draft-id> --profile publisher --json
readany epub export <draft-id> --output <path> --profile publisher --json
readany notes export <book-id> --output <path> --profile publisher --json
readany knowledge export --output <path> --profile publisher --json
readany skill status --json
\`\`\`

Managed by ReadAny CLI ${version}.
`;
}

function parseSkillVersion(content: string): string | undefined {
  const match = content.match(/Managed by ReadAny CLI ([^\s.]+(?:\.[^\s.]+)*)\./);
  return match?.[1];
}

export async function getSkillStatus(skillFile: string): Promise<SkillStatus> {
  try {
    const content = await readFile(skillFile, "utf8");
    return {
      installed: content.includes(MANAGED_MARKER),
      path: skillFile,
      version: parseSkillVersion(content),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { installed: false, path: skillFile };
    }
    throw error;
  }
}

export async function installSkill(skillFile: string): Promise<SkillInstallResult> {
  const status = await getSkillStatus(skillFile);
  if (status.version === undefined && status.installed === false) {
    try {
      await readFile(skillFile, "utf8");
      throw new Error(`Skill file already exists and is not managed by ReadAny CLI: ${skillFile}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  await mkdir(dirname(skillFile), { recursive: true });
  await writeFile(skillFile, createSkillContent(), "utf8");
  return {
    installed: true,
    path: skillFile,
    version: CLI_VERSION,
  };
}

export async function updateSkill(skillFile: string): Promise<SkillUpdateResult> {
  const status = await getSkillStatus(skillFile);
  if (!status.installed) {
    throw new Error(
      `ReadAny skill is not installed or is not managed by ReadAny CLI: ${skillFile}`,
    );
  }

  await mkdir(dirname(skillFile), { recursive: true });
  await writeFile(skillFile, createSkillContent(), "utf8");
  return {
    updated: true,
    path: skillFile,
    previousVersion: status.version,
    version: CLI_VERSION,
  };
}

export async function uninstallSkill(skillFile: string): Promise<SkillUninstallResult> {
  const status = await getSkillStatus(skillFile);
  if (!status.installed) {
    return { removed: false, path: skillFile };
  }

  await rm(skillFile, { force: true });
  await removeDirIfEmpty(dirname(skillFile));
  return { removed: true, path: skillFile };
}

async function removeDirIfEmpty(path: string): Promise<void> {
  try {
    if ((await readdir(path)).length === 0) {
      await rmdir(path);
    }
  } catch {
    // Best-effort cleanup only; user files in the skill directory must be preserved.
  }
}
