import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isValidIp } from "./proxy";
import { getPlatformPaths } from "./service/paths";

export interface KnifeConfig {
  host: string;
  port: number;
  publicDomain: string;
  publicScheme: "http" | "https";
  trustedProxies: string[];
  theme: string;
  auth?: {
    githubClientId: string;
    githubClientSecret: string;
    allowedUsername: string;
    allowedUserId?: number;
  };
  sessionSecret: string;
}

export const DEFAULT_CONFIG: Omit<KnifeConfig, "sessionSecret"> = {
  host: "127.0.0.1",
  port: 3000,
  publicDomain: "",
  publicScheme: "https",
  trustedProxies: ["127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
  theme: "catppuccin-mocha",
};

export function resolveConfigPath(cliConfigPath?: string): string {
  if (cliConfigPath) {
    return resolve(cliConfigPath);
  }
  if (process.env.KNIFE_CONFIG_PATH) {
    return resolve(process.env.KNIFE_CONFIG_PATH);
  }
  const cwdConfig = join(process.cwd(), "config.json");
  if (existsSync(cwdConfig)) {
    return cwdConfig;
  }
  try {
    const userConfig = join(getPlatformPaths().userConfigDir, "config.json");
    if (existsSync(userConfig)) {
      return userConfig;
    }
  } catch {
    // Ignore platform paths resolution errors
  }
  return cwdConfig;
}

export const CONFIG_PATH = resolveConfigPath();
export function parseCliArgs(args: string[]): {
  onboarding?: boolean;
  host?: string;
  port?: number;
  domain?: string;
  configPath?: string;
  help?: boolean;
  unknown?: string[];
} {
  const result: {
    onboarding?: boolean;
    host?: string;
    port?: number;
    domain?: string;
    configPath?: string;
    help?: boolean;
    unknown?: string[];
  } = {};
  const unknown: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      result.help = true;
    } else if (arg === "onboarding" && !result.onboarding) {
      result.onboarding = true;
    } else if (arg === "--host" && i + 1 < args.length) {
      result.host = args[++i];
    } else if (arg.startsWith("--host=")) {
      result.host = arg.slice("--host=".length);
    } else if ((arg === "-p" || arg === "--port") && i + 1 < args.length) {
      result.port = parseInt(args[++i], 10);
    } else if (arg.startsWith("--port=")) {
      result.port = parseInt(arg.slice("--port=".length), 10);
    } else if (arg === "--config" && i + 1 < args.length) {
      result.configPath = args[++i];
    } else if (arg.startsWith("--config=")) {
      result.configPath = arg.slice("--config=".length);
    } else if ((arg === "-d" || arg === "--domain") && i + 1 < args.length) {
      result.domain = args[++i];
    } else if (arg.startsWith("--domain=")) {
      result.domain = arg.slice("--domain=".length);
    } else {
      unknown.push(arg);
    }
  }

  if (unknown.length > 0) {
    result.unknown = unknown;
  }

  return result;
}

export function validateHost(host: string): boolean {
  if (host === "localhost" || host === "0.0.0.0" || host === "::") {
    return true;
  }
  return isValidIp(host);
}

export function validatePort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Loads configuration with precedence:
 * CLI flags / env (KNIFE_HOST, KNIFE_PORT) > config.json > defaults
 */
export function loadConfig(
  cliArgs: { host?: string; port?: number; domain?: string; configPath?: string } = {},
): {
  config: KnifeConfig;
  isFirstRun: boolean;
  configPath: string;
} {
  const configPath = resolveConfigPath(cliArgs.configPath);
  let fileConfig: Partial<KnifeConfig> = {};
  let isFirstRun = true;

  let raw: string | null = null;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read config at ${configPath}: ${message}`, { cause: err });
    }
  }

  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Config root must be a JSON object");
      }
      fileConfig = parsed as Partial<KnifeConfig>;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to parse config at ${configPath}: ${message}`, { cause: e });
    }
    if (
      fileConfig.auth?.allowedUserId !== undefined &&
      (typeof fileConfig.auth.allowedUserId !== "number" ||
        !Number.isInteger(fileConfig.auth.allowedUserId) ||
        fileConfig.auth.allowedUserId <= 0)
    ) {
      throw new Error(
        `Invalid allowedUserId in config at ${configPath}: must be a positive integer`,
      );
    }
    // Considered first run if publicDomain or auth is missing/incomplete
    if (
      fileConfig.publicDomain &&
      fileConfig.auth?.githubClientId &&
      (fileConfig.auth?.allowedUsername || fileConfig.auth?.allowedUserId)
    ) {
      isFirstRun = false;
    }
  }

  // Precedence: CLI > ENV > config.json > defaults
  const host = cliArgs.host || process.env.KNIFE_HOST || fileConfig.host || DEFAULT_CONFIG.host;

  const rawPort =
    cliArgs.port ||
    (process.env.KNIFE_PORT ? parseInt(process.env.KNIFE_PORT, 10) : undefined) ||
    fileConfig.port ||
    DEFAULT_CONFIG.port;

  const port = Number(rawPort);

  if (!validateHost(host)) {
    throw new Error(
      `Invalid listen host '${host}'. Host must be a valid IPv4 address (e.g. 127.0.0.1), IPv6 address (e.g. ::1), 'localhost', or '0.0.0.0'.`,
    );
  }

  if (!validatePort(port)) {
    throw new Error(
      `Invalid listen port '${rawPort}'. Port must be an integer between 1 and 65535.`,
    );
  }

  const sessionSecret =
    fileConfig.sessionSecret ||
    process.env.KNIFE_SESSION_SECRET ||
    crypto.randomUUID() + "-" + crypto.randomUUID();

  const config: KnifeConfig = {
    host,
    port,
    publicDomain:
      cliArgs.domain ||
      process.env.KNIFE_PUBLIC_DOMAIN ||
      fileConfig.publicDomain ||
      DEFAULT_CONFIG.publicDomain,
    publicScheme: fileConfig.publicScheme || DEFAULT_CONFIG.publicScheme,
    trustedProxies: fileConfig.trustedProxies || DEFAULT_CONFIG.trustedProxies,
    theme: fileConfig.theme || DEFAULT_CONFIG.theme,
    auth: fileConfig.auth,
    sessionSecret,
  };

  return { config, isFirstRun, configPath };
}

export function saveConfig(config: KnifeConfig, configPath: string = resolveConfigPath()): void {
  const dir = dirname(configPath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);

  const tmpPath = join(dir, `.config.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
    chmodSync(tmpPath, 0o600);
    renameSync(tmpPath, configPath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup error if temp file was never created or already moved
    }
    throw err;
  }
}
