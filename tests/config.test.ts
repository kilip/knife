import { describe, it, expect } from "bun:test";
import {
  parseCliArgs,
  validateHost,
  validatePort,
  loadConfig,
  resolveConfigPath,
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
    const parsed = parseCliArgs(["doctor"]);
    expect(parsed.unknown).toEqual(["doctor"]);

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
});
