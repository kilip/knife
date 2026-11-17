import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSessionToken } from "../server/auth";
import { hasSession } from "../server/tmux";

describe("Knife End-to-End System Tests", () => {
  const testPort = 3589;
  const testDir = join("/tmp", `knife-e2e-${Date.now()}`);
  const configPath = join(testDir, "config.json");
  let serverProcess: ReturnType<typeof Bun.spawn> | null = null;
  let setupToken: string = "";
  let capturedStdout = "";
  let capturedStderr = "";

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });

    // Spawn knife server with custom test port & config path
    serverProcess = Bun.spawn(
      ["bun", "run", "server/index.ts", "--port", String(testPort), "--config", configPath],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          KNIFE_DATA_DIR: join(testDir, "data"),
          KNIFE_CONFIG_PATH: configPath,
          KNIFE_PORT: String(testPort),
          KNIFE_HOST: "127.0.0.1",
          KNIFE_SESSION_SECRET: "test-secret-key-e2e",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stderrStream = serverProcess.stderr as ReadableStream<Uint8Array>;
    const stderrReader = stderrStream.getReader();
    const stderrDecoder = new TextDecoder();
    void (async () => {
      try {
        while (true) {
          const { value, done } = await stderrReader.read();
          if (done) break;
          capturedStderr += stderrDecoder.decode(value, { stream: true });
        }
      } catch {}
    })();

    const stream = serverProcess.stdout as ReadableStream<Uint8Array>;
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      capturedStdout += decoder.decode(value, { stream: true });
      const match = capturedStdout.match(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape sequence match
        /One-time Setup Token:\s*(?:\x1b\[[0-9;]*m)*([a-f0-9]{32,64})/i,
      );
      if (match) {
        setupToken = match[1];
        break;
      }
    }

    // Continue draining stdout in the background for log assertions
    void (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          capturedStdout += decoder.decode(value, { stream: true });
        }
      } catch {}
    })();
  });

  afterAll(() => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch {}
    }
    if (existsSync(testDir)) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it("boots in first-run mode and prints setup token", () => {
    expect(setupToken).toBeDefined();
    expect(setupToken.length).toBeGreaterThanOrEqual(32);
  });

  it("never logs query string tokens such as /setup?token=SECRET", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/setup?token=SECRET`);
    expect(res.status).toBe(200);

    // Trigger another logged route so stdout has flushed past /setup
    await fetch(`http://127.0.0.1:${testPort}/api/config/public`);
    const deadline = Date.now() + 2000;
    while (!capturedStdout.includes("[http] GET /api/config/public") && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(capturedStdout).toContain("[http] GET /setup");
    expect(capturedStdout).not.toContain("SECRET");
    expect(capturedStderr).not.toContain("SECRET");
  });

  it("serves health check and public config", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/health`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; isFirstRun: boolean };
    expect(data.status).toBe("ok");
    expect(data.isFirstRun).toBe(true);

    const pubRes = await fetch(`http://127.0.0.1:${testPort}/api/config/public`);
    expect(pubRes.status).toBe(200);
    const pubData = (await pubRes.json()) as { isFirstRun: boolean };
    expect(pubData.isFirstRun).toBe(true);
  });

  it("redirects GET / and non-/setup paths to /setup without leaking setup token", async () => {
    for (const path of ["/", "/login", "/terminal"]) {
      const res = await fetch(`http://127.0.0.1:${testPort}${path}`, {
        redirect: "manual",
      });
      expect(res.status).toBe(302);
      const location = res.headers.get("Location") ?? "";
      expect(location).toBe("/setup");
      expect(location).not.toContain("?token=");
      expect(location).not.toContain(setupToken);

      const body = await res.text();
      expect(body).not.toContain("?token=");
      expect(body).not.toContain(setupToken);
    }
  });

  it("serves sw.js and manifest.webmanifest with proper headers", async () => {
    const swRes = await fetch(`http://127.0.0.1:${testPort}/sw.js`);
    expect(swRes.status).toBe(200);
    expect(swRes.headers.get("Content-Type")).toContain("application/javascript");
    expect(swRes.headers.get("Cache-Control")).toContain("no-cache");
    expect(swRes.headers.get("Service-Worker-Allowed")).toBe("/");

    const manifestRes = await fetch(`http://127.0.0.1:${testPort}/manifest.webmanifest`);
    expect(manifestRes.status).toBe(200);
    expect(manifestRes.headers.get("Content-Type")).toContain("application/manifest+json");
    expect(manifestRes.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("rejects setup with invalid token without logging expected token", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "invalid-token",
        publicDomain: "knife.test.local",
        githubClientId: "test-client-id",
        githubClientSecret: "test-secret",
        allowedUsername: "testowner",
      }),
    });
    expect(res.status).toBe(403);

    const deadline = Date.now() + 2000;
    while (!capturedStderr.includes("[setup] Token verification failed") && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }

    const failedLines = `${capturedStdout}\n${capturedStderr}`
      .split("\n")
      .filter((line) => line.includes("Token verification failed"));
    expect(failedLines.length).toBeGreaterThan(0);
    for (const line of failedLines) {
      expect(line).not.toContain(setupToken);
    }
  });

  it("rejects unauthenticated WS upgrade to /ws/terminal with 401 in first-run mode", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/ws/terminal?tabId=test`, {
      headers: {
        Upgrade: "websocket",
        Connection: "Upgrade",
      },
    });
    expect(res.status).toBe(401);
  });

  it("completes first-run setup and saves configuration", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: setupToken,
        publicDomain: "knife.test.local",
        publicScheme: "https",
        githubClientId: "gh-client-12345",
        githubClientSecret: "gh-secret-67890",
        allowedUsername: "testowner",
        theme: "tokyo-night",
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);

    // Verify token cannot be used again
    const repeatRes = await fetch(`http://127.0.0.1:${testPort}/api/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: setupToken,
        publicDomain: "knife.test.local",
        githubClientId: "gh-client-12345",
        githubClientSecret: "gh-secret-67890",
        allowedUsername: "testowner",
      }),
    });
    expect(repeatRes.status).toBe(400);
  });

  it("rejects unauthenticated WS upgrade to /ws/terminal with 401 in configured mode", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/ws/terminal?tabId=test`, {
      headers: {
        Upgrade: "websocket",
        Connection: "Upgrade",
      },
    });
    expect(res.status).toBe(401);
  });

  it("manages tab lifecycle and preserves direct shell session on disconnect", async () => {
    // Generate valid session cookie for testowner
    const sessionToken = createSessionToken("testowner", "test-secret-key-e2e");
    const cookieHeader = `knife_session=${sessionToken}`;

    // 1. Fetch tabs
    const tabsRes = await fetch(`http://127.0.0.1:${testPort}/api/tabs`, {
      headers: { Cookie: cookieHeader },
    });
    expect(tabsRes.status).toBe(200);
    const initialTabs = (await tabsRes.json()) as Array<{ id: string; sessionName: string }>;
    expect(Array.isArray(initialTabs)).toBe(true);
    expect(initialTabs.length).toBeGreaterThanOrEqual(1);

    // 2. Create second tab
    const createRes = await fetch(`http://127.0.0.1:${testPort}/api/tabs`, {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Work Tab" }),
    });
    expect(createRes.status).toBe(201);
    const createdTab = (await createRes.json()) as {
      id: string;
      name: string;
      sessionName: string;
    };
    expect(createdTab.name).toBe("Work Tab");

    // 3. Connect via WebSocket to the created tab using session cookie
    const wsUrl = `ws://127.0.0.1:${testPort}/ws/terminal?tabId=${createdTab.id}`;
    const ws = new WebSocket(wsUrl, {
      headers: { Cookie: cookieHeader },
    } as unknown as string[]);

    let output = "";
    const { promise: p1, resolve: r1, reject: rej1 } = Promise.withResolvers<void>();

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "resize", cols: 130, rows: 42 }));
      ws.send(JSON.stringify({ type: "input", data: "echo knife_shell_survives\n" }));
    };

    ws.onmessage = (e) => {
      output += String(e.data);
      if (output.includes("knife_shell_survives")) {
        r1();
      }
    };

    ws.onerror = (err) => rej1(err);

    await p1;
    expect(output).toContain("knife_shell_survives");

    // 4. Disconnect WebSocket (simulating page reload or network drop)
    const { promise: closePromise, resolve: closeResolve } = Promise.withResolvers<void>();
    ws.onclose = () => closeResolve();
    ws.close(1000, "Normal disconnect");
    await closePromise;

    // 5. Reconnect to the same tab and verify session is intact
    const ws2 = new WebSocket(wsUrl, {
      headers: { Cookie: cookieHeader },
    } as unknown as string[]);
    let output2 = "";
    const { promise: p2, resolve: r2, reject: rej2 } = Promise.withResolvers<void>();

    ws2.onopen = () => {
      ws2.send(JSON.stringify({ type: "refresh" }));
      ws2.send(JSON.stringify({ type: "input", data: "echo reconnected_ok\n" }));
    };

    ws2.onmessage = (e) => {
      output2 += String(e.data);
      if (output2.includes("reconnected_ok")) {
        r2();
      }
    };

    ws2.onerror = (err) => rej2(err);

    await p2;
    expect(output2).toContain("reconnected_ok");

    const { promise: closePromise2, resolve: closeResolve2 } = Promise.withResolvers<void>();
    ws2.onclose = () => closeResolve2();
    ws2.close();
    await closePromise2;

    // 6. Explicitly close tab via DELETE /api/tabs/:id
    const deleteRes = await fetch(`http://127.0.0.1:${testPort}/api/tabs/${createdTab.id}`, {
      method: "DELETE",
      headers: { Cookie: cookieHeader },
    });
    expect(deleteRes.status).toBe(200);

    // Verify tab deleted on explicit close
    const remainingTabsRes = await fetch(`http://127.0.0.1:${testPort}/api/tabs`, {
      headers: { Cookie: cookieHeader },
    });
    const remainingTabs = (await remainingTabsRes.json()) as Array<{ id: string }>;
    expect(remainingTabs.some((t) => t.id === createdTab.id)).toBe(false);
  });
  it("supports file browser API, upload, download, streaming archive, and CWD synchronization", async () => {
    const sessionToken = createSessionToken("testowner", "test-secret-key-e2e");
    const cookieHeader = `knife_session=${sessionToken}`;

    // 1. Unauthenticated request returns 401
    const unauthRes = await fetch(`http://127.0.0.1:${testPort}/api/fs/list`);
    expect(unauthRes.status).toBe(401);

    // 2. Fetch tabs to test tab CWD
    const tabsRes = await fetch(`http://127.0.0.1:${testPort}/api/tabs`, {
      headers: { Cookie: cookieHeader },
    });
    expect(tabsRes.status).toBe(200);
    const tabs = (await tabsRes.json()) as Array<{ id: string; sessionName: string }>;
    expect(Array.isArray(tabs)).toBe(true);
    expect(tabs.length).toBeGreaterThan(0);
    const targetTab = tabs[0];

    const cwdRes = await fetch(`http://127.0.0.1:${testPort}/api/tabs/${targetTab.id}/cwd`, {
      headers: { Cookie: cookieHeader },
    });
    expect(cwdRes.status).toBe(200);
    const cwdData = (await cwdRes.json()) as { id: string; cwd: string };
    expect(cwdData.id).toBe(targetTab.id);
    expect(cwdData.cwd).toBeDefined();

    // 3. Create a test directory inside testDir via POST /api/fs/action
    const mkdirRes = await fetch(`http://127.0.0.1:${testPort}/api/fs/action`, {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mkdir", parent: testDir, name: "e2e_folder" }),
    });
    expect(mkdirRes.status).toBe(200);

    // 4. Create a test file via POST /api/fs/action
    const touchRes = await fetch(`http://127.0.0.1:${testPort}/api/fs/action`, {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "touch",
        parent: join(testDir, "e2e_folder"),
        name: "e2e_file.txt",
      }),
    });
    expect(touchRes.status).toBe(200);

    // 5. List directory contents via GET /api/fs/list
    const listRes = await fetch(
      `http://127.0.0.1:${testPort}/api/fs/list?path=${encodeURIComponent(join(testDir, "e2e_folder"))}`,
      { headers: { Cookie: cookieHeader } },
    );
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as {
      items: Array<{ name: string; isDirectory: boolean }>;
    };
    expect(listData.items.some((i) => i.name === "e2e_file.txt")).toBe(true);

    // 5b. Rename file via POST /api/fs/action
    const renameRes = await fetch(`http://127.0.0.1:${testPort}/api/fs/action`, {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "rename",
        oldPath: join(testDir, "e2e_folder", "e2e_file.txt"),
        name: "renamed_file.txt",
      }),
    });
    expect(renameRes.status).toBe(200);

    // 6. Upload a file via POST /api/fs/upload
    const formData = new FormData();
    formData.append("targetDir", join(testDir, "e2e_folder"));
    formData.append("overwrite", "true");
    formData.append(
      "files",
      new Blob(["uploaded content 123"], { type: "text/plain" }),
      "uploaded.txt",
    );
    formData.append("relativePaths", "uploaded.txt");

    const uploadRes = await fetch(`http://127.0.0.1:${testPort}/api/fs/upload`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
      body: formData,
    });
    expect(uploadRes.status).toBe(200);
    const uploadData = (await uploadRes.json()) as { success: boolean; uploaded: string[] };
    expect(uploadData.success).toBe(true);
    expect(uploadData.uploaded).toContain("uploaded.txt");

    // 6b. Upload collision handling with overwrite: false (verifies skipped)
    const collisionFormData = new FormData();
    collisionFormData.append("targetDir", join(testDir, "e2e_folder"));
    collisionFormData.append("overwrite", "false");
    collisionFormData.append(
      "files",
      new Blob(["collision attempt"], { type: "text/plain" }),
      "uploaded.txt",
    );
    collisionFormData.append("relativePaths", "uploaded.txt");

    const collisionRes = await fetch(`http://127.0.0.1:${testPort}/api/fs/upload`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
      body: collisionFormData,
    });
    expect(collisionRes.status).toBe(200);
    const collisionData = (await collisionRes.json()) as { success: boolean; skipped: string[] };
    expect(collisionData.skipped).toContain("uploaded.txt");

    // 6c. Boundary containment check: path traversal attempts outside targetDir are rejected
    const traversalFormData = new FormData();
    traversalFormData.append("targetDir", join(testDir, "e2e_folder"));
    traversalFormData.append("overwrite", "true");
    traversalFormData.append("files", new Blob(["escaped"], { type: "text/plain" }), "escaped.txt");
    traversalFormData.append("relativePaths", "../escaped.txt");

    const traversalRes = await fetch(`http://127.0.0.1:${testPort}/api/fs/upload`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
      body: traversalFormData,
    });
    expect(traversalRes.status).toBe(200);
    const traversalData = (await traversalRes.json()) as { success: boolean; uploaded: string[] };
    expect(traversalData.uploaded).not.toContain("../escaped.txt");
    expect(existsSync(join(testDir, "escaped.txt"))).toBe(false);

    // 7. Download uploaded file via GET /api/fs/download
    const downloadRes = await fetch(
      `http://127.0.0.1:${testPort}/api/fs/download?path=${encodeURIComponent(
        join(testDir, "e2e_folder", "uploaded.txt"),
      )}`,
      { headers: { Cookie: cookieHeader } },
    );
    expect(downloadRes.status).toBe(200);
    const downloadedText = await downloadRes.text();
    expect(downloadedText).toBe("uploaded content 123");

    // 8. Stream ZIP archive via POST /api/fs/archive
    const archiveRes = await fetch(`http://127.0.0.1:${testPort}/api/fs/archive`, {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [join(testDir, "e2e_folder")] }),
    });
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.headers.get("Content-Type")).toBe("application/zip");
    const archiveBuffer = await archiveRes.arrayBuffer();
    const view = new Uint8Array(archiveBuffer);
    expect(view[0]).toBe(0x50); // 'P'
    expect(view[1]).toBe(0x4b); // 'K'

    // 9. Guardrail: Destructive delete on protected path returns 403
    const guardrailRes = await fetch(`http://127.0.0.1:${testPort}/api/fs/action`, {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", path: "/etc" }),
    });
    expect(guardrailRes.status).toBe(403);

    // 9b. Empty action inputs reject with 400 Bad Request
    const emptyDeleteRes = await fetch(`http://127.0.0.1:${testPort}/api/fs/action`, {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", paths: ["", "   "] }),
    });
    expect(emptyDeleteRes.status).toBe(400);

    const emptyRenameRes = await fetch(`http://127.0.0.1:${testPort}/api/fs/action`, {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename" }),
    });
    expect(emptyRenameRes.status).toBe(400);

    // 10. Delete created test file via POST /api/fs/action
    const deleteFileRes = await fetch(`http://127.0.0.1:${testPort}/api/fs/action`, {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", path: join(testDir, "e2e_folder", "uploaded.txt") }),
    });
    expect(deleteFileRes.status).toBe(200);
  });

  it("manages user settings via /api/settings GET and PATCH", async () => {
    const sessionToken = createSessionToken("testowner", "test-secret-key-e2e");
    const cookieHeader = `knife_session=${sessionToken}`;

    // 1. Unauthenticated request returns 401
    const unauthRes = await fetch(`http://127.0.0.1:${testPort}/api/settings`);
    expect(unauthRes.status).toBe(401);

    // 2. Authenticated GET returns default settings
    const getRes = await fetch(`http://127.0.0.1:${testPort}/api/settings`, {
      headers: { Cookie: cookieHeader },
    });
    expect(getRes.status).toBe(200);
    const settings = (await getRes.json()) as { fontSize: number; theme: string };
    expect(settings.fontSize).toBe(15);

    // 3. Authenticated PATCH updates settings
    const patchRes = await fetch(`http://127.0.0.1:${testPort}/api/settings`, {
      method: "PATCH",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        fontSize: 22,
        theme: "nord",
        cursorStyle: "underline",
        compactTabs: true,
      }),
    });
    expect(patchRes.status).toBe(200);
    const updated = (await patchRes.json()) as {
      fontSize: number;
      theme: string;
      cursorStyle: string;
      compactTabs: boolean;
    };
    expect(updated.fontSize).toBe(22);
    expect(updated.theme).toBe("nord");
    expect(updated.cursorStyle).toBe("underline");
    expect(updated.compactTabs).toBe(true);

    // 4. Re-fetch verify persistence
    const verifyRes = await fetch(`http://127.0.0.1:${testPort}/api/settings`, {
      headers: { Cookie: cookieHeader },
    });
    expect(verifyRes.status).toBe(200);
    const persisted = (await verifyRes.json()) as { fontSize: number; theme: string };
    expect(persisted.fontSize).toBe(22);
    expect(persisted.theme).toBe("nord");
  });

  it("requires auth and whitelists theme IDs on POST /api/theme", async () => {
    const sessionToken = createSessionToken("testowner", "test-secret-key-e2e");
    const cookieHeader = `knife_session=${sessionToken}`;

    // 1. Unauthenticated POST returns 401
    const unauthRes = await fetch(`http://127.0.0.1:${testPort}/api/theme`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "nord" }),
    });
    expect(unauthRes.status).toBe(401);

    // 2. Authenticated POST with unknown theme ID returns 400
    const invalidRes = await fetch(`http://127.0.0.1:${testPort}/api/theme`, {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "invalid-theme-id" }),
    });
    expect(invalidRes.status).toBe(400);

    // 3. Authenticated POST with valid theme ID returns 200 and updates theme
    const validRes = await fetch(`http://127.0.0.1:${testPort}/api/theme`, {
      method: "POST",
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "dracula" }),
    });
    expect(validRes.status).toBe(200);
    const body = (await validRes.json()) as { theme: string };
    expect(body.theme).toBe("dracula");
  });

  it("ignores ?sessionToken= on WS and rejects old cookies after /auth/logout", async () => {
    const sessionToken = createSessionToken("testowner", "test-secret-key-e2e");
    const cookieHeader = `knife_session=${sessionToken}`;

    // 1. ?sessionToken= query parameter without Cookie must be rejected with 401
    const wsRes = await fetch(
      `http://127.0.0.1:${testPort}/ws/terminal?tabId=tab-1&sessionToken=${sessionToken}`,
      {
        headers: {
          Upgrade: "websocket",
          Connection: "Upgrade",
          "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
          "Sec-WebSocket-Version": "13",
          Origin: `http://127.0.0.1:${testPort}`,
        },
      },
    );
    expect(wsRes.status).toBe(401);

    // 2. Verify session works before logout
    const meBefore = await fetch(`http://127.0.0.1:${testPort}/api/me`, {
      headers: { Cookie: cookieHeader },
    });
    expect(meBefore.status).toBe(200);

    // 3. Call /auth/logout with the session cookie
    const logoutRes = await fetch(`http://127.0.0.1:${testPort}/auth/logout`, {
      headers: { Cookie: cookieHeader },
      redirect: "manual",
    });
    expect(logoutRes.status).toBe(302);

    // 4. Old cookie must now be rejected with 401
    const meAfter = await fetch(`http://127.0.0.1:${testPort}/api/me`, {
      headers: { Cookie: cookieHeader },
    });
    expect(meAfter.status).toBe(401);
  });

  it("allows deleting all tabs down to zero tabs without auto-creating a new tab", async () => {
    const sessionToken = createSessionToken("testowner", "test-secret-key-e2e");
    const cookieHeader = `knife_session=${sessionToken}`;

    const tabsRes = await fetch(`http://127.0.0.1:${testPort}/api/tabs`, {
      headers: { Cookie: cookieHeader },
    });
    const tabs = (await tabsRes.json()) as Array<{ id: string }>;

    for (const tab of tabs) {
      const delRes = await fetch(`http://127.0.0.1:${testPort}/api/tabs/${tab.id}`, {
        method: "DELETE",
        headers: { Cookie: cookieHeader },
      });
      expect(delRes.status).toBe(200);
    }

    const checkRes = await fetch(`http://127.0.0.1:${testPort}/api/tabs`, {
      headers: { Cookie: cookieHeader },
    });
    const checkTabs = (await checkRes.json()) as Array<{ id: string }>;
    expect(checkTabs.length).toBe(0);
  });

  it("fails startup on corrupt config.json instead of falling back to unauthenticated first-run", async () => {
    const corruptDir = join("/tmp", `knife-e2e-corrupt-${Date.now()}`);
    const corruptConfigPath = join(corruptDir, "config.json");
    const corruptPort = 3590;
    mkdirSync(corruptDir, { recursive: true });
    writeFileSync(corruptConfigPath, "{ invalid json", "utf-8");

    try {
      const proc = Bun.spawn(
        [
          "bun",
          "run",
          "server/index.ts",
          "--port",
          String(corruptPort),
          "--config",
          corruptConfigPath,
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            KNIFE_DATA_DIR: join(corruptDir, "data"),
            KNIFE_CONFIG_PATH: corruptConfigPath,
            KNIFE_PORT: String(corruptPort),
            KNIFE_HOST: "127.0.0.1",
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      const exitCode = await proc.exited;
      const stderrText = await new Response(proc.stderr).text();
      expect(exitCode).not.toBe(0);
      expect(stderrText).toContain("Failed to parse config");

      await expect(
        fetch(`http://127.0.0.1:${corruptPort}/ws/terminal?tabId=test`, {
          headers: {
            Upgrade: "websocket",
            Connection: "Upgrade",
          },
        }),
      ).rejects.toThrow();
    } finally {
      rmSync(corruptDir, { recursive: true, force: true });
    }
  });

  it("knife onboarding starts setup mode and prints setup URL with token to local stdout only", async () => {
    const onboardingDir = join("/tmp", `knife-onboarding-${Date.now()}`);
    const onboardingConfigPath = join(onboardingDir, "config.json");
    const onboardingPort = 3591;
    mkdirSync(onboardingDir, { recursive: true });

    let onboardingProc: ReturnType<typeof Bun.spawn> | null = null;
    try {
      onboardingProc = Bun.spawn(
        [
          "bun",
          "run",
          "server/index.ts",
          "onboarding",
          "--port",
          String(onboardingPort),
          "--config",
          onboardingConfigPath,
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            KNIFE_DATA_DIR: join(onboardingDir, "data"),
            KNIFE_CONFIG_PATH: onboardingConfigPath,
            KNIFE_PORT: String(onboardingPort),
            KNIFE_HOST: "127.0.0.1",
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      const stream = onboardingProc.stdout as ReadableStream<Uint8Array>;
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let stdoutText = "";
      let onboardingToken = "";

      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        stdoutText += decoder.decode(value, { stream: true });
        const match = stdoutText.match(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape sequence match
          /One-time Setup Token:\s*(?:\x1b\[[0-9;]*m)*([a-f0-9]{32,64})/i,
        );
        if (match) {
          onboardingToken = match[1];
          break;
        }
      }

      expect(onboardingToken.length).toBeGreaterThanOrEqual(32);
      expect(stdoutText).toContain(
        `http://127.0.0.1:${onboardingPort}/setup?token=${onboardingToken}`,
      );

      // Verify HTTP GET / redirects without leaking token
      const res = await fetch(`http://127.0.0.1:${onboardingPort}/`, {
        redirect: "manual",
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/setup");
      expect(await res.text()).not.toContain(onboardingToken);
    } finally {
      if (onboardingProc) {
        try {
          onboardingProc.kill();
        } catch {}
      }
      rmSync(onboardingDir, { recursive: true, force: true });
    }
  });

  it("knife onboarding exits cleanly when already configured", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "server/index.ts", "onboarding", "--config", configPath],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          KNIFE_DATA_DIR: join(testDir, "data"),
          KNIFE_CONFIG_PATH: configPath,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const exitCode = await proc.exited;
    const stdoutText = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);
    expect(stdoutText).toContain("Knife is already configured");
  });
});
