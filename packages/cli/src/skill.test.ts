import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getSkillStatus, installSkill, uninstallSkill, updateSkill } from "./skill.js";
import { listTools } from "./tool-registry.js";

describe("skill management", () => {
  it("installs, reports, and uninstalls a managed skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-skill-"));
    const skillFile = join(root, "skills", "readany", "SKILL.md");

    expect(await getSkillStatus(skillFile)).toMatchObject({
      installed: false,
      path: skillFile,
    });

    const installed = await installSkill(skillFile);
    expect(installed).toMatchObject({ installed: true, path: skillFile });

    const content = await readFile(skillFile, "utf8");
    expect(content).toContain("readany-cli-managed");
    expect(content).toContain(
      "readany agent setup --user --client generic --profile readonly --json",
    );
    expect(content).toContain(
      "readany agent setup --user --client codex --profile readonly --json",
    );
    expect(content).toContain(
      "readany agent setup --user --client claude --profile readonly --json",
    );
    expect(content).toContain(
      "readany agent setup --user --client cursor --profile readonly --json",
    );
    expect(content).toContain(
      "readany agent setup --user --client opencode --profile readonly --json",
    );
    expect(content).toContain("readany agent setup --user --client all --profile readonly --json");
    expect(content).toContain("readany mcp serve --profile readonly");
    expect(content).toContain("readany mcp config --profile readonly --client generic --json");
    expect(content).toContain("readany mcp config --profile readonly --client codex --json");
    expect(content).toContain("readany mcp config --profile readonly --client claude --json");
    expect(content).toContain("readany mcp config --profile readonly --client cursor --json");
    expect(content).toContain("readany mcp config --profile readonly --client opencode --json");
    expect(content).toContain("readany tools list --json");
    expect(content).toContain("readany chapters list <book-id> --json");
    expect(content).toContain("readany context get --json");
    expect(content).toContain("readany bookmarks list <book-id> --json");
    expect(content).toContain("readany skills list --json");
    expect(content).toContain("readany epub inspect <book-id> --profile editor --json");
    expect(content).toContain("readany epub chapter read <draft-id> <chapter-id> --format xhtml");
    expect(content).toContain("readany epub chapter patch <draft-id> <chapter-id>");
    expect(content).toContain("readany epub chapters patch <draft-id> --patch <file>");
    expect(content).toContain("readany epub history <draft-id> --profile editor --json");
    expect(content).toContain("readany epub diff <draft-id> --profile editor --json");
    expect(content).toContain("readany epub draft discard <draft-id>");
    expect(content).toContain("readany epub export <draft-id> --output <path>");
    expect(content).toContain(
      "readany knowledge export --output <path> --profile publisher --json",
    );
    for (const tool of listTools()) {
      expect(content).toContain(`\`${tool.name}\``);
    }

    expect(await getSkillStatus(skillFile)).toMatchObject({
      installed: true,
      path: skillFile,
    });

    expect(await uninstallSkill(skillFile)).toEqual({
      removed: true,
      path: skillFile,
    });
    expect(await getSkillStatus(skillFile)).toMatchObject({ installed: false });
  });

  it("does not overwrite or remove unmanaged skill files", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-unmanaged-skill-"));
    const skillFile = join(root, "skills", "readany", "SKILL.md");
    await mkdir(join(root, "skills", "readany"), { recursive: true });
    await writeFile(skillFile, "# Custom Skill\n\nUser content\n", "utf8");

    await expect(installSkill(skillFile)).rejects.toThrow(/not managed by ReadAny CLI/);
    expect(await readFile(skillFile, "utf8")).toContain("User content");

    expect(await uninstallSkill(skillFile)).toEqual({
      removed: false,
      path: skillFile,
    });
    expect(await readFile(skillFile, "utf8")).toContain("User content");
  });

  it("updates only an installed managed skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-update-skill-"));
    const skillFile = join(root, "skills", "readany", "SKILL.md");

    await expect(updateSkill(skillFile)).rejects.toThrow(/not installed or is not managed/);
    await installSkill(skillFile);
    const updated = await updateSkill(skillFile);
    expect(updated).toMatchObject({
      updated: true,
      path: skillFile,
    });
    expect(await readFile(skillFile, "utf8")).toContain("readany-cli-managed");
  });

  it("removes only managed skill file and preserves user files in the directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-skill-extra-"));
    const skillFile = join(root, "skills", "readany", "SKILL.md");
    const extraFile = join(root, "skills", "readany", "notes.md");

    await installSkill(skillFile);
    await writeFile(extraFile, "user notes", "utf8");

    expect(await uninstallSkill(skillFile)).toEqual({
      removed: true,
      path: skillFile,
    });
    expect(await getSkillStatus(skillFile)).toMatchObject({ installed: false });
    expect(await readFile(extraFile, "utf8")).toBe("user notes");
  });
});
