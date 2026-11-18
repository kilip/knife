import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { createSessionToken } from "../../server/auth";

export type ServerBootMode = "first-run" | "configured";

const E2E_SESSION_SECRET = "e2e-playwright-session-secret";

/**
 * Reserves and returns an available ephemeral TCP port on 127.0.0.1.
 */
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("Failed to resolve ephemeral port"));
        return;
      }
      const { port } = addr;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

/**
 * Hermetic Knife server spawner isolated to a temporary directory and random port.
 */
export class KnifeServerHarness {
  public port = 0;
  public baseUrl = "";
  public setupToken = "";
  public readonly sessionSecret = E2E_SESSION_SECRET;
  public readonly allowedUsername = "octocat";

  private readonly testDir = join("/tmp", `knife-e2e-pw-${crypto.randomUUID()}`);
  private readonly configPath = join(this.testDir, "config.json");
  private readonly dataDir = join(this.testDir, "data");
  private process: ReturnType<typeof Bun.spawn> | null = null;

  /**
   * Starts a fresh Knife server in either `first-run` or `configured` mode.
   */
  async start(mode: ServerBootMode): Promise<void> {
    this.port = await getFreePort();
    this.baseUrl = `http://127.0.0.1:${this.port}`;

    mkdirSync(this.dataDir, { recursive: true });

    if (mode === "configured") {
      writeFileSync(
        this.configPath,
        JSON.stringify(
          {
            isFirstRun: false,
            host: "127.0.0.1",
            port: this.port,
            publicDomain: `127.0.0.1:${this.port}`,
            publicScheme: "http",
            auth: {
              githubClientId: "e2e-github-client-id",
              githubClientSecret: "e2e-github-client-secret",
              allowedUsername: this.allowedUsername,
            },
            sessionSecret: this.sessionSecret,
            theme: "catppuccin-mocha",
            trustedProxies: ["127.0.0.1", "::1"],
          },
          null,
          2,
        ),
      );
    }

    this.process = Bun.spawn(
      ["bun", "run", "server/index.ts", "--port", String(this.port), "--config", this.configPath],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          KNIFE_DATA_DIR: this.dataDir,
          KNIFE_CONFIG_PATH: this.configPath,
          KNIFE_PORT: String(this.port),
          KNIFE_HOST: "127.0.0.1",
          KNIFE_SESSION_SECRET: this.sessionSecret,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    if (mode === "first-run") {
      await this.waitForSetupToken();
    }
    await this.waitForHealth();
  }

  /**
   * Builds a Playwright cookie object signed with the server's HMAC session secret.
   */
  createSessionCookie(username: string = this.allowedUsername) {
    const token = createSessionToken(username, this.sessionSecret);
    return {
      name: "knife_session",
      value: token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax" as const,
    };
  }

  /**
   * Terminates the spawned server process and deletes its temporary directory.
   */
  async stop(): Promise<void> {
    if (this.process) {
      try {
        this.process.kill("SIGKILL");
        await Promise.race([this.process.exited, new Promise((r) => setTimeout(r, 2000))]);
      } catch {
        // Ignore already-exited process errors during teardown
      }
      this.process = null;
    }

    if (existsSync(this.testDir)) {
      try {
        rmSync(this.testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup races
      }
    }
  }

  private async waitForSetupToken(): Promise<void> {
    const stream = this.process?.stdout as ReadableStream<Uint8Array> | undefined;
    if (!stream) {
      throw new Error("Server stdout stream is unavailable");
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let captured = "";
    const deadline = Date.now() + 15000;

    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      captured += decoder.decode(value, { stream: true });
      const match = captured.match(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape sequence match
        /One-time Setup Token:\s*(?:\x1b\[[0-9;]*m)*([a-f0-9]{32,64})/i,
      );
      if (match) {
        this.setupToken = match[1];
        void this.drainStream(reader);
        return;
      }
    }

    throw new Error(`Timed out waiting for One-time Setup Token. Output:\n${captured}`);
  }

  private async drainStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // Stream closed on process exit
    }
  }

  private async waitForHealth(): Promise<void> {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${this.baseUrl}/health`);
        if (res.status === 200) return;
      } catch {
        // Server still starting
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Timed out waiting for Knife server health at ${this.baseUrl}/health`);
  }
}
