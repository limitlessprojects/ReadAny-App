import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type IPlatformService, setPlatformService } from "../services/platform";
import { appendLog, appendStructuredLog, clearLogs, collectLogs } from "./feedback-service";

function createTestPlatform(): IPlatformService {
  const files = new Map<string, string>();

  return {
    platformType: "desktop",
    isMobile: false,
    isDesktop: true,
    readFile: async (path) => new TextEncoder().encode(files.get(path) ?? ""),
    writeFile: async (path, data) => {
      files.set(path, new TextDecoder().decode(data));
    },
    writeTextFile: async (path, content) => {
      files.set(path, content);
    },
    readTextFile: async (path) => files.get(path) ?? "",
    mkdir: async () => {},
    exists: async (path) => files.has(path),
    deleteFile: async (path) => {
      files.delete(path);
    },
    getAppDataDir: async () => "/tmp/readany-feedback-test",
    getDataDir: async () => "/tmp/readany-feedback-test",
    joinPath: async (...parts) => parts.join("/").replace(/\/+/g, "/"),
    convertFileSrc: (path) => path,
    pickFile: async () => null,
    loadDatabase: async () => {
      throw new Error("Database is not available in feedback log tests");
    },
    fetch: async (url, options) => fetch(url, options),
    createWebSocket: async () => {
      throw new Error("WebSocket is not available in feedback log tests");
    },
    getAppVersion: async () => "0.0.0-test",
    kvGetItem: async () => null,
    kvSetItem: async () => {},
    kvRemoveItem: async () => {},
    kvGetAllKeys: async () => [],
    copyToClipboard: async () => {},
    shareOrDownloadFile: async () => null,
  };
}

describe("feedback log buffer", () => {
  beforeEach(async () => {
    setPlatformService(createTestPlatform());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T00:00:00.000Z"));
    await clearLogs();
  });

  afterEach(async () => {
    await clearLogs();
    vi.useRealTimers();
  });

  it("collects the last hour by default", async () => {
    appendLog("old log");

    vi.setSystemTime(new Date("2026-05-08T01:00:01.000Z"));
    appendLog("recent log");

    const logs = await collectLogs();

    expect(logs).toContain("recent log");
    expect(logs).not.toContain("old log");
  });

  it("filters logs by the requested time window", async () => {
    appendLog("expired log");

    vi.setSystemTime(new Date("2026-05-09T00:00:01.000Z"));
    appendLog("fresh log");

    const logs = await collectLogs({ sinceMs: 60 * 60 * 1000 });

    expect(logs).toContain("fresh log");
    expect(logs).not.toContain("expired log");
  });

  it("stores structured app events", async () => {
    appendStructuredLog("feedback.submit.start", { type: "bug" });

    const logs = await collectLogs();

    expect(logs).toContain("[event:feedback.submit.start]");
    expect(logs).toContain('"type":"bug"');
  });
});
