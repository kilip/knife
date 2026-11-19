import { describe, expect, it } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  type KnifeConfig,
  loadConfig,
  parseCliArgs,
  resolveConfigPath,
  saveConfig,
  validateHost,
  validatePort,
} from "../server/config";

describe("Server Config & CLI Parser", () => {
  it("parses CLI args correctly", () => {
    const args = [
      "--host",
      "0.0.0.0",
      "--port",
      "8080",
      "--config",
      "/tmp/knife-test.json",
      "--domain",
      "knife.itstoni.com",
    ];
    const parsed = parseCliArgs(args);
    expect(parsed.host).toBe("0.0.0.0");
    expect(parsed.port).toBe(8080);
    expect(parsed.configPath).toBe("/tmp/knife-test.json");
    expect(parsed.domain).toBe("knife.itstoni.com");
  });

  it("handles -d and --domain= syntax", () => {
    const args1 = ["-d", "knife.example.com"];
    expect(parseCliArgs(args1).domain).toBe("knife.example.com");

    const args2 = ["--domain=knife.itstoni.com"];
    expect(parseCliArgs(args2).domain).toBe("knife.itstoni.com");
  });
  it("handles --host= and --port= inline syntax", () => {
    const args = ["--host=192.168.1.50", "--port=4000"];
    const parsed = parseCliArgs(args);
    expect(parsed.host).toBe("192.168.1.50");
    expect(parsed.port).toBe(4000);
  });
  it("captures unknown arguments and commands", () => {
    const parsed = parseCliArgs(["unknown-cmd"]);
    expect(parsed.unknown).toEqual(["unknown-cmd"]);

    const parsedMixed = parseCliArgs(["--port", "3000", "bogus", "--foo"]);
    expect(parsedMixed.port).toBe(3000);
    expect(parsedMixed.unknown).toEqual(["bogus", "--foo"]);
  });

  it("validates IPv4, IPv6, localhost, and 0.0.0.0 hosts", () => {
    expect(validateHost("127.0.0.1")).toBe(true);
    expect(validateHost("0.0.0.0")).toBe(true);
    expect(validateHost("localhost")).toBe(true);
    expect(validateHost("::1")).toBe(true);
    expect(validateHost("::")).toBe(true);
    expect(validateHost("2001:db8::1")).toBe(true);

    expect(validateHost("invalid_ip")).toBe(false);
    expect(validateHost("999.999.999.999")).toBe(false);
    expect(validateHost("127.0.0.1.1")).toBe(false);
  });

  it("validates port ranges", () => {
    expect(validatePort(3000)).toBe(true);
    expect(validatePort(80)).toBe(true);
    expect(validatePort(65535)).toBe(true);

    expect(validatePort(0)).toBe(false);
    expect(validatePort(-1)).toBe(false);
    expect(validatePort(65536)).toBe(false);
    expect(validatePort(NaN)).toBe(false);
  });

  it("enforces precedence: CLI > defaults", () => {
    const { config } = loadConfig({ host: "127.0.0.2", port: 9000 });
    expect(config.host).toBe("127.0.0.2");
    expect(config.port).toBe(9000);

    const { config: domainConfig } = loadConfig({ domain: "knife.itstoni.com" });
    expect(domainConfig.publicDomain).toBe("knife.itstoni.com");
  });

  it("respects KNIFE_PUBLIC_DOMAIN environment variable", () => {
    const prev = process.env.KNIFE_PUBLIC_DOMAIN;
    process.env.KNIFE_PUBLIC_DOMAIN = "env.knife.itstoni.com";
    try {
      const { config } = loadConfig({});
      expect(config.publicDomain).toBe("env.knife.itstoni.com");
    } finally {
      if (prev !== undefined) {
        process.env.KNIFE_PUBLIC_DOMAIN = prev;
      } else {
        delete process.env.KNIFE_PUBLIC_DOMAIN;
      }
    }
  });

  it("resolves config path with fallback precedence", () => {
    expect(resolveConfigPath("/custom/path.json")).toBe("/custom/path.json");

    const prev = process.env.KNIFE_CONFIG_PATH;
    process.env.KNIFE_CONFIG_PATH = "/env/knife.json";
    try {
      expect(resolveConfigPath()).toBe("/env/knife.json");
    } finally {
      if (prev !== undefined) {
        process.env.KNIFE_CONFIG_PATH = prev;
      } else {
        delete process.env.KNIFE_CONFIG_PATH;
      }
    }
  });

  it("enters isFirstRun = true only when config file does not exist (ENOENT)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "knife-config-enoent-"));
    try {
      const missingPath = join(tmpDir, "missing.json");
      const { isFirstRun, configPath } = loadConfig({ configPath: missingPath });
      expect(isFirstRun).toBe(true);
      expect(configPath).toBe(missingPath);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws on corrupt or non-object config.json instead of falling back to first-run", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "knife-config-corrupt-"));
    try {
      const corruptPath = join(tmpDir, "config.json");
      writeFileSync(corruptPath, "{ invalid json", "utf-8");
      expect(() => loadConfig({ configPath: corruptPath })).toThrow(/Failed to parse config/);

      writeFileSync(corruptPath, "", "utf-8");
      expect(() => loadConfig({ configPath: corruptPath })).toThrow(/Failed to parse config/);

      writeFileSync(corruptPath, "[]", "utf-8");
      expect(() => loadConfig({ configPath: corruptPath })).toThrow(
        /Config root must be a JSON object/,
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws on non-ENOENT read errors", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "knife-config-eisdir-"));
    try {
      const dirAsConfig = join(tmpDir, "config.json");
      mkdirSync(dirAsConfig);
      expect(() => loadConfig({ configPath: dirAsConfig })).toThrow(/Failed to read config/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("saveConfig writes atomically and leaves no temp files behind", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "knife-config-atomic-"));
    try {
      const configDir = join(tmpDir, "nested");
      const configPath = join(configDir, "config.json");
      const config: KnifeConfig = {
        ...DEFAULT_CONFIG,
        publicDomain: "knife.example.com",
        auth: {
          githubClientId: "client-id",
          githubClientSecret: "client-secret",
          allowedUsername: "kilip",
          allowedUserId: 123456,
        },
        sessionSecret: "super-secret-value",
      };

      saveConfig(config, configPath);

      expect(readdirSync(configDir)).toEqual(["config.json"]);
      const saved = JSON.parse(readFileSync(configPath, "utf-8")) as KnifeConfig;
      expect(saved).toEqual(config);

      const loaded = loadConfig({ configPath });
      expect(loaded.isFirstRun).toBe(false);
      expect(loaded.config.auth?.allowedUserId).toBe(123456);
      expect(loaded.config.sessionSecret).toBe("super-secret-value");

      // Overwriting an existing config also leaves no temp files
      saveConfig({ ...config, port: 4000 }, configPath);
      expect(readdirSync(configDir)).toEqual(["config.json"]);
      expect(loadConfig({ configPath }).config.port).toBe(4000);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("saveConfig enforces 0700 directory and 0600 file permissions on POSIX", () => {
    if (process.platform === "win32") {
      return;
    }

    const tmpDir = mkdtempSync(join(tmpdir(), "knife-config-perms-"));
    try {
      const configDir = join(tmpDir, "conf");
      const configPath = join(configDir, "config.json");

      // Pre-create with overly permissive modes to verify saveConfig tightens them
      mkdirSync(configDir, { mode: 0o755 });
      chmodSync(configDir, 0o755);
      writeFileSync(configPath, "{}", { encoding: "utf-8", mode: 0o644 });
      chmodSync(configPath, 0o644);

      saveConfig(
        {
          ...DEFAULT_CONFIG,
          sessionSecret: "secret-123",
        },
        configPath,
      );

      const dirMode = statSync(configDir).mode & 0o777;
      const fileMode = statSync(configPath).mode & 0o777;
      expect(dirMode).toBe(0o700);
      expect(fileMode).toBe(0o600);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
