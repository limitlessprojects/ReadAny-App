import { realpathSync } from "node:fs";
import { lstat, mkdir, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installCli, isManagedShim, resolveShimPath, uninstallCli } from "./install.js";
import { resolveExecutablePath } from "./paths.js";

describe("cli install", () => {
  it("resolves user shim path", () => {
    expect(
      resolveShimPath({
        binPath: "/app/readany.js",
        userBinDir: "/tmp/bin",
        platformName: "darwin",
      }),
    ).toEqual({
      path: "/tmp/bin/readany",
      mode: "user",
      platformName: "darwin",
    });
  });

  it("resolves the real CLI target when argv[1] is a managed symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-paths-symlink-"));
    const binPath = join(root, "dist", "bin", "readany.js");
    const shimPath = join(root, "bin", "readany");
    await mkdir(join(root, "dist", "bin"), { recursive: true });
    await mkdir(join(root, "bin"), { recursive: true });
    await writeFile(binPath, "#!/usr/bin/env node\n", "utf8");
    await symlink(binPath, shimPath);

    expect(resolveExecutablePath({}, { argv1: shimPath })).toBe(realpathSync(binPath));
  });

  it("ignores non-CLI argv[1] paths and falls back to the module-derived entrypoint", () => {
    const resolved = resolveExecutablePath(
      {},
      {
        argv1: "/tmp/vitest/dist/workers/forks.js",
        moduleUrl: "file:///repo/packages/cli/dist/chunks/chunk-ABC123.js",
      },
    );
    expect(resolved).toBe("/repo/packages/cli/dist/bin/readany.js");
  });

  it("installs and uninstalls a unix symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-install-"));
    const binPath = join(root, "dist", "bin", "readany.js");
    const userBinDir = join(root, "bin");

    const installed = await installCli({
      binPath,
      userBinDir,
      platformName: "darwin",
    });
    expect(installed).toMatchObject({
      installed: true,
      path: join(userBinDir, "readany"),
      target: binPath,
      mode: "user",
    });

    const stat = await lstat(installed.path);
    expect(stat.isSymbolicLink()).toBe(true);

    expect(
      await uninstallCli({
        binPath,
        userBinDir,
        platformName: "darwin",
      }),
    ).toEqual({
      removed: true,
      path: join(userBinDir, "readany"),
      mode: "user",
    });
  });

  it("installs a Windows command shim", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-win-install-"));
    const binPath = join(root, "dist", "bin", "readany.js");
    const userBinDir = join(root, "bin");

    const installed = await installCli({
      binPath,
      userBinDir,
      platformName: "win32",
    });

    expect(installed.path).toBe(join(userBinDir, "readany.cmd"));
    const content = await readFile(installed.path, "utf8");
    expect(content).toContain("readany-cli-managed");
    expect(content).toContain(`node "${binPath}" %*`);

    expect(
      await uninstallCli({
        binPath,
        userBinDir,
        platformName: "win32",
      }),
    ).toEqual({
      removed: true,
      path: join(userBinDir, "readany.cmd"),
      mode: "user",
    });
  });

  it("replaces a unix symlink to another ReadAny CLI build", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-old-managed-symlink-"));
    const binPath = join(root, "current", "dist", "bin", "readany.js");
    const oldBinPath = join(root, "old", "dist", "bin", "readany.js");
    const userBinDir = join(root, "bin");
    const shimPath = join(userBinDir, "readany");
    await mkdir(join(root, "current", "dist", "bin"), { recursive: true });
    await mkdir(join(root, "old", "dist", "bin"), { recursive: true });
    await mkdir(userBinDir, { recursive: true });
    await writeFile(binPath, "#!/usr/bin/env node\n", "utf8");
    await writeFile(oldBinPath, "#!/usr/bin/env node\nconst marker = 'readany-cli-managed';\n", "utf8");
    await symlink(oldBinPath, shimPath);

    await expect(isManagedShim(shimPath, binPath)).resolves.toBe(true);
    await expect(
      installCli({
        binPath,
        userBinDir,
        platformName: "darwin",
      }),
    ).resolves.toMatchObject({
      installed: true,
      target: binPath,
    });
    expect(await readlink(shimPath)).toBe(binPath);
  });

  it("removes a unix symlink to another ReadAny CLI build", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-old-managed-uninstall-"));
    const binPath = join(root, "current", "dist", "bin", "readany.js");
    const oldBinPath = join(root, "old", "dist", "bin", "readany.js");
    const userBinDir = join(root, "bin");
    const shimPath = join(userBinDir, "readany");
    await mkdir(join(root, "current", "dist", "bin"), { recursive: true });
    await mkdir(join(root, "old", "dist", "bin"), { recursive: true });
    await mkdir(userBinDir, { recursive: true });
    await writeFile(binPath, "#!/usr/bin/env node\n", "utf8");
    await writeFile(oldBinPath, "#!/usr/bin/env node\nconst marker = 'readany-cli-managed';\n", "utf8");
    await symlink(oldBinPath, shimPath);

    await expect(isManagedShim(shimPath, binPath)).resolves.toBe(true);
    await expect(
      uninstallCli({
        binPath,
        userBinDir,
        platformName: "darwin",
      }),
    ).resolves.toEqual({
      removed: true,
      path: shimPath,
      mode: "user",
    });
    await expect(lstat(shimPath)).rejects.toThrow();
  });

  it("removes a Windows command shim managed by another ReadAny CLI build", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-win-old-managed-"));
    const binPath = join(root, "current", "dist", "bin", "readany.js");
    const oldBinPath = join(root, "old", "dist", "bin", "readany.js");
    const userBinDir = join(root, "bin");
    const shimPath = join(userBinDir, "readany.cmd");
    await mkdir(userBinDir, { recursive: true });
    await writeFile(
      shimPath,
      `@echo off\r\nREM readany-cli-managed\r\nnode "${oldBinPath}" %*\r\n`,
      "utf8",
    );

    await expect(isManagedShim(shimPath, binPath)).resolves.toBe(true);
    await expect(
      uninstallCli({
        binPath,
        userBinDir,
        platformName: "win32",
      }),
    ).resolves.toEqual({
      removed: true,
      path: shimPath,
      mode: "user",
    });
    await expect(lstat(shimPath)).rejects.toThrow();
  });

  it("removes additional managed CLI shims from PATH only when requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-extra-path-shim-"));
    const binPath = join(root, "current", "dist", "bin", "readany.js");
    const oldBinPath = join(root, "global", "lib", "node_modules", "@readany", "cli", "dist", "bin", "readany.js");
    const userBinDir = join(root, "user-bin");
    const pathBinDir = join(root, "path-bin");
    const pathShim = join(pathBinDir, "readany");
    await mkdir(join(root, "current", "dist", "bin"), { recursive: true });
    await mkdir(join(root, "global", "lib", "node_modules", "@readany", "cli", "dist", "bin"), {
      recursive: true,
    });
    await mkdir(pathBinDir, { recursive: true });
    await writeFile(binPath, "#!/usr/bin/env node\n", "utf8");
    await writeFile(oldBinPath, "#!/usr/bin/env node\nconst marker = 'readany-cli-managed';\n", "utf8");
    await symlink(oldBinPath, pathShim);

    await expect(
      uninstallCli({
        binPath,
        userBinDir,
        platformName: "darwin",
        pathEnv: pathBinDir,
      }),
    ).resolves.toEqual({
      removed: false,
      path: join(userBinDir, "readany"),
      mode: "user",
    });
    expect((await lstat(pathShim)).isSymbolicLink()).toBe(true);

    await expect(
      uninstallCli({
        binPath,
        userBinDir,
        platformName: "darwin",
        removePathShims: true,
        pathEnv: pathBinDir,
      }),
    ).resolves.toEqual({
      removed: false,
      path: join(userBinDir, "readany"),
      mode: "user",
      extraRemoved: [pathShim],
    });
    await expect(lstat(pathShim)).rejects.toThrow();
  });

  it("does not overwrite or remove unmanaged user commands", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-unmanaged-"));
    const binPath = join(root, "dist", "bin", "readany.js");
    const userBinDir = join(root, "bin");
    const unmanaged = join(userBinDir, "readany");
    await mkdir(userBinDir, { recursive: true });
    await writeFile(unmanaged, "#!/bin/sh\necho user command\n", "utf8");

    await expect(isManagedShim(unmanaged, binPath)).resolves.toBe(false);
    await expect(
      installCli({
        binPath,
        userBinDir,
        platformName: "darwin",
      }),
    ).rejects.toThrow(/not managed by ReadAny CLI/);

    await expect(
      uninstallCli({
        binPath,
        userBinDir,
        platformName: "darwin",
      }),
    ).rejects.toThrow(/not managed by ReadAny CLI/);
    expect(await readFile(unmanaged, "utf8")).toContain("user command");
  });

  it("does not overwrite or remove symlinks to a different target", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-other-symlink-"));
    const binPath = join(root, "dist", "bin", "readany.js");
    const otherTarget = join(root, "other", "readany.js");
    const userBinDir = join(root, "bin");
    const unmanaged = join(userBinDir, "readany");
    await mkdir(userBinDir, { recursive: true });
    await mkdir(join(root, "other"), { recursive: true });
    await writeFile(otherTarget, "#!/usr/bin/env node\n", "utf8");
    await symlink(otherTarget, unmanaged);

    await expect(isManagedShim(unmanaged, binPath)).resolves.toBe(false);
    await expect(
      installCli({
        binPath,
        userBinDir,
        platformName: "darwin",
      }),
    ).rejects.toThrow(/not managed by ReadAny CLI/);

    await expect(
      uninstallCli({
        binPath,
        userBinDir,
        platformName: "darwin",
      }),
    ).rejects.toThrow(/not managed by ReadAny CLI/);

    const stat = await lstat(unmanaged);
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it("does not remove unmanaged Windows command shims", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-win-unmanaged-"));
    const binPath = join(root, "dist", "bin", "readany.js");
    const userBinDir = join(root, "bin");
    const unmanaged = join(userBinDir, "readany.cmd");
    await mkdir(userBinDir, { recursive: true });
    await writeFile(unmanaged, "@echo off\r\necho user command\r\n", "utf8");

    await expect(
      installCli({
        binPath,
        userBinDir,
        platformName: "win32",
      }),
    ).rejects.toThrow(/not managed by ReadAny CLI/);

    await expect(
      uninstallCli({
        binPath,
        userBinDir,
        platformName: "win32",
      }),
    ).rejects.toThrow(/not managed by ReadAny CLI/);
    expect(await readFile(unmanaged, "utf8")).toContain("user command");
  });
});
