import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { createSessionToken } from "../server/auth";
import type { KnifeConfig } from "../server/config";
import type { TabData } from "../server/features/tabs/store";

describe("Feature Routes (tabs, fs, settings, update)", () => {
  const rootTempDir = mkdtempSync(join(tmpdir(), "knife-feature-routes-"));
  const dataDir = join(rootTempDir, "data");
  const configPath = join(rootTempDir, "config.json");
  const workDir = join(rootTempDir, "work");
  const originalDataDir = process.env.KNIFE_DATA_DIR;
  const originalConfigPath = process.env.KNIFE_CONFIG_PATH;

  let config: KnifeConfig;
  let tabs: TabData[];
  let cookieHeader: string;

  beforeAll(() => {
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(workDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({ theme: "catppuccin-mocha" }), "utf-8");
    writeFileSync(join(workDir, "sample.txt"), "hello world", "utf-8");
    process.env.KNIFE_DATA_DIR = dataDir;
    process.env.KNIFE_CONFIG_PATH = configPath;
  });

  afterAll(() => {
    if (originalDataDir) {
      process.env.KNIFE_DATA_DIR = originalDataDir;
    } else {
      delete process.env.KNIFE_DATA_DIR;
    }
    if (originalConfigPath) {
      process.env.KNIFE_CONFIG_PATH = originalConfigPath;
    } else {
      delete process.env.KNIFE_CONFIG_PATH;
    }
    if (existsSync(rootTempDir)) {
      rmSync(rootTempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    config = {
      host: "127.0.0.1",
      port: 3000,
      publicDomain: "knife.example.com",
      publicScheme: "https",
      trustedProxies: ["127.0.0.1"],
      theme: "catppuccin-mocha",
      sessionSecret: "feature-routes-secret",
      auth: {
        githubClientId: "cid",
        githubClientSecret: "csec",
        allowedUsername: "testowner",
        allowedUserId: 1,
      },
    };
    tabs = [{ id: "tab-1", name: "Shell 1", order: 0, createdAt: 100 }];
    const token = createSessionToken("testowner", config.sessionSecret);
    cookieHeader = `knife_session=${token}`;
  });

  function makeApp(persistTabs?: (next: TabData[]) => void) {
    return createApp({
      getConfig: () => config,
      getIsFirstRun: () => false,
      setIsFirstRun: () => {},
      saveConfig: () => {},
      getTabs: () => tabs,
      setTabs: (next) => {
        tabs = next;
      },
      persistTabs: persistTabs ?? (() => {}),
    });
  }

  it("handles /api/tabs* unauthenticated, success, validation, and persistence failure", async () => {
    const app = makeApp();

    const unauth = await app.request("/api/tabs");
    expect(unauth.status).toBe(401);

    const listRes = await app.request("/api/tabs", { headers: { Cookie: cookieHeader } });
    expect(listRes.status).toBe(200);
    expect(await listRes.json()).toHaveLength(1);

    const badType = await app.request("/api/tabs", {
      method: "POST",
      headers: { Origin: "https://knife.example.com", Cookie: cookieHeader },
      body: "plain",
    });
    expect(badType.status).toBe(415);

    const createRes = await app.request("/api/tabs", {
      method: "POST",
      headers: {
        Origin: "https://knife.example.com",
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Tab 2" }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as TabData;
    expect(tabs).toHaveLength(2);

    const cwdRes = await app.request(`/api/tabs/${created.id}/cwd`, {
      headers: { Cookie: cookieHeader },
    });
    expect(cwdRes.status).toBe(200);

    const missingCwd = await app.request("/api/tabs/nonexistent/cwd", {
      headers: { Cookie: cookieHeader },
    });
    expect(missingCwd.status).toBe(404);

    const renameRes = await app.request(`/api/tabs/${created.id}`, {
      method: "PATCH",
      headers: {
        Origin: "https://knife.example.com",
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(renameRes.status).toBe(200);
    expect(tabs[1].name).toBe("Renamed");

    const reorderRes = await app.request("/api/tabs/reorder", {
      method: "POST",
      headers: {
        Origin: "https://knife.example.com",
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tabIds: [created.id, "tab-1"] }),
    });
    expect(reorderRes.status).toBe(200);
    expect(tabs[0].id).toBe(created.id);

    const deleteRes = await app.request(`/api/tabs/${created.id}`, {
      method: "DELETE",
      headers: { Origin: "https://knife.example.com", Cookie: cookieHeader },
    });
    expect(deleteRes.status).toBe(200);
    expect(tabs).toHaveLength(1);

    const failingApp = makeApp(() => {
      throw new Error("disk full");
    });
    const failCreate = await failingApp.request("/api/tabs", {
      method: "POST",
      headers: {
        Origin: "https://knife.example.com",
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Should Fail" }),
    });
    expect(failCreate.status).toBe(500);
    expect(tabs).toHaveLength(1);
  });

  it("handles /api/settings unauthenticated, GET, PATCH, and validation", async () => {
    const app = makeApp();

    expect((await app.request("/api/settings")).status).toBe(401);

    const getRes = await app.request("/api/settings", { headers: { Cookie: cookieHeader } });
    expect(getRes.status).toBe(200);

    const badPatch = await app.request("/api/settings", {
      method: "PATCH",
      headers: {
        Origin: "https://knife.example.com",
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["not-an-object"]),
    });
    expect(badPatch.status).toBe(400);

    const okPatch = await app.request("/api/settings", {
      method: "PATCH",
      headers: {
        Origin: "https://knife.example.com",
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fontSize: 16 }),
    });
    expect(okPatch.status).toBe(200);
    expect(((await okPatch.json()) as { fontSize: number }).fontSize).toBe(16);
  });

  it("handles /api/system/update/check auth and response shape", async () => {
    const app = makeApp();

    expect((await app.request("/api/system/update/check")).status).toBe(401);

    const res = await app.request("/api/system/update/check", {
      headers: { Cookie: cookieHeader },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.activeTabsCount).toBe(1);
    expect(typeof data.currentVersion).toBe("string");
  });

  it("handles /api/fs/* success, validation, and unauthenticated cases", async () => {
    const app = makeApp();

    expect((await app.request("/api/fs/list")).status).toBe(401);

    const listRes = await app.request(`/api/fs/list?path=${encodeURIComponent(workDir)}`, {
      headers: { Cookie: cookieHeader },
    });
    expect(listRes.status).toBe(200);

    const statMissing = await app.request("/api/fs/stat", {
      headers: { Cookie: cookieHeader },
    });
    expect(statMissing.status).toBe(400);

    const statOk = await app.request(
      `/api/fs/stat?path=${encodeURIComponent(join(workDir, "sample.txt"))}`,
      { headers: { Cookie: cookieHeader } },
    );
    expect(statOk.status).toBe(200);

    const downloadOk = await app.request(
      `/api/fs/download?path=${encodeURIComponent(join(workDir, "sample.txt"))}`,
      { headers: { Cookie: cookieHeader } },
    );
    expect(downloadOk.status).toBe(200);
    expect(await downloadOk.text()).toBe("hello world");

    const archiveBad = await app.request("/api/fs/archive", {
      method: "POST",
      headers: {
        Origin: "https://knife.example.com",
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paths: [] }),
    });
    expect(archiveBad.status).toBe(400);

    const actionMissing = await app.request("/api/fs/action", {
      method: "POST",
      headers: {
        Origin: "https://knife.example.com",
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(actionMissing.status).toBe(400);
  });

  it("rejects protected paths (config.json, data dir, install root) across EVERY /api/fs/* route", async () => {
    const app = makeApp();
    const protectedTargets = [configPath, dataDir, process.cwd()];

    for (const target of protectedTargets) {
      const listRes = await app.request(`/api/fs/list?path=${encodeURIComponent(target)}`, {
        headers: { Cookie: cookieHeader },
      });
      expect(listRes.status).toBe(403);

      const statRes = await app.request(`/api/fs/stat?path=${encodeURIComponent(target)}`, {
        headers: { Cookie: cookieHeader },
      });
      expect(statRes.status).toBe(403);

      const downloadRes = await app.request(`/api/fs/download?path=${encodeURIComponent(target)}`, {
        headers: { Cookie: cookieHeader },
      });
      expect(downloadRes.status).toBe(403);

      const archiveRes = await app.request("/api/fs/archive", {
        method: "POST",
        headers: {
          Origin: "https://knife.example.com",
          Cookie: cookieHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paths: [target] }),
      });
      expect(archiveRes.status).toBe(403);

      const formData = new FormData();
      formData.append("targetDir", target);
      formData.append("files", new Blob(["x"]), "evil.txt");
      const uploadRes = await app.request("/api/fs/upload", {
        method: "POST",
        headers: {
          Origin: "https://knife.example.com",
          Cookie: cookieHeader,
        },
        body: formData,
      });
      expect(uploadRes.status).toBe(403);

      const actionRes = await app.request("/api/fs/action", {
        method: "POST",
        headers: {
          Origin: "https://knife.example.com",
          Cookie: cookieHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "delete", path: target }),
      });
      expect(actionRes.status).toBe(403);
    }
  });
});
