import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_CONFIG, type KnifeConfig, validateHost, validatePort } from "../../config";
import {
  detectInstalledService,
  getPlatformPaths,
  isWsl,
  resolveBunExecutable,
} from "../../service";
import { defaultRunner } from "../../service/runner";
import type { CommandRunner } from "../../service/types";
import { getUserShell } from "../terminal/shell";
import {
  checkLatestVersion,
  compareSemver,
  type FetchLike,
  getCurrentVersion,
  getPackageRoot,
  isSourceCheckout,
} from "../update/update";

export type DoctorCheckStatus = "pass" | "warn" | "fail" | "info";

export interface DoctorCheckResult {
  id: string;
  label: string;
  status: DoctorCheckStatus;
  message: string;
  hint?: string;
}

export interface DoctorReport {
  version: string;
  ok: boolean;
  summary: {
    pass: number;
    warn: number;
    fail: number;
    info: number;
  };
  checks: DoctorCheckResult[];
}

export interface DoctorOptions {
  configPath?: string;
  host?: string;
  port?: number;
  serviceName: string;
  system?: boolean;
  offline: boolean;
  json: boolean;
  help: boolean;
}

export interface DoctorDeps {
  platform?: NodeJS.Platform;
  arch?: string;
  isWslFn?: () => boolean;
  bunVersion?: string | null;
  bunExecutable?: string;
  packageRoot?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  runner?: CommandRunner;
  fetchFn?: FetchLike;
  shellPath?: string;
  testPty?: () => { ok: boolean; error?: string };
  currentVersion?: string;
}

function tokenizeSystemdExecStart(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let hasToken = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === "\\" && i + 1 < raw.length) {
        const next = raw[i + 1];
        if (next === "\\" || next === '"') {
          current += next;
          i++;
          continue;
        }
      }
      if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
      hasToken = true;
    } else if (ch === '"') {
      inQuotes = true;
      hasToken = true;
    } else if (/\s/.test(ch)) {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
    } else if (ch === "\\" && i + 1 < raw.length) {
      current += raw[i + 1];
      i++;
      hasToken = true;
    } else {
      current += ch;
      hasToken = true;
    }
  }

  if (hasToken) {
    tokens.push(current);
  }
  return tokens;
}

function unescapeXml(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Extracts the Bun executable and entrypoint paths from a systemd unit or launchd plist.
 */
export function extractServiceUnitPaths(
  unitContent: string,
  platform: NodeJS.Platform,
): { bunPath?: string; entrypointPath?: string } {
  if (platform === "darwin") {
    const progMatch = unitContent.match(
      /<key>\s*ProgramArguments\s*<\/key>\s*<array>([\s\S]*?)<\/array>/i,
    );
    if (!progMatch) return {};
    const args: string[] = [];
    for (const match of progMatch[1].matchAll(/<string>([\s\S]*?)<\/string>/gi)) {
      args.push(unescapeXml(match[1].trim()));
    }
    if (args.length === 0) return {};
    const bunPath = args[0];
    const runIdx = args.indexOf("run");
    const entrypointPath =
      runIdx >= 0 && runIdx + 1 < args.length
        ? args[runIdx + 1]
        : args.find((arg) => arg.endsWith("server/index.ts") || arg.endsWith("server\\index.ts"));
    return { bunPath, entrypointPath };
  }

  const execMatch = unitContent.match(/^ExecStart=(.+)$/m);
  if (!execMatch) return {};
  const tokens = tokenizeSystemdExecStart(execMatch[1].trim());
  if (tokens.length === 0) return {};
  const bunPath = tokens[0];
  const runIdx = tokens.indexOf("run");
  const entrypointPath =
    runIdx >= 0 && runIdx + 1 < tokens.length
      ? tokens[runIdx + 1]
      : tokens.find((tok) => tok.endsWith("server/index.ts") || tok.endsWith("server\\index.ts"));
  return { bunPath, entrypointPath };
}

function resolveDoctorConfigPath(
  cliConfigPath: string | undefined,
  cwd: string,
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
): string {
  if (cliConfigPath) {
    return resolve(cwd, cliConfigPath);
  }
  if (env.KNIFE_CONFIG_PATH) {
    return resolve(cwd, env.KNIFE_CONFIG_PATH);
  }
  const cwdConfig = join(cwd, "config.json");
  if (existsSync(cwdConfig)) {
    return cwdConfig;
  }
  try {
    const userConfig = join(getPlatformPaths("knife", platform, env).userConfigDir, "config.json");
    if (existsSync(userConfig)) {
      return userConfig;
    }
  } catch {
    // Ignore platform paths resolution errors
  }
  return cwdConfig;
}

function resolveDoctorDataDir(
  configPath: string,
  cwd: string,
  env: Record<string, string | undefined>,
): string {
  if (env.KNIFE_DATA_DIR) {
    return resolve(cwd, env.KNIFE_DATA_DIR);
  }
  const adjacentData = join(dirname(configPath), "data");
  if (existsSync(adjacentData)) {
    return adjacentData;
  }
  const cwdData = join(cwd, "data");
  if (existsSync(cwdData)) {
    return cwdData;
  }
  return adjacentData;
}

function detectBunVersion(deps: DoctorDeps | undefined, runner: CommandRunner): string | null {
  if (deps?.bunVersion !== undefined) {
    return deps.bunVersion;
  }
  if (typeof Bun !== "undefined" && typeof Bun.version === "string") {
    return Bun.version;
  }
  const res = runner.run("bun", ["--version"]);
  if (res.exitCode === 0 && res.stdout) {
    const firstLine = res.stdout.split(/\r?\n/)[0]?.trim();
    if (firstLine) {
      return firstLine;
    }
  }
  return null;
}

function defaultTestPty(): { ok: boolean; error?: string } {
  if (typeof Bun === "undefined" || typeof Bun.Terminal !== "function") {
    return { ok: false, error: "Bun.Terminal API unavailable in current runtime" };
  }
  let term: InstanceType<typeof Bun.Terminal> | null = null;
  try {
    term = new Bun.Terminal({ cols: 80, rows: 24, data() {} });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      term?.close();
    } catch {
      // Ignore cleanup failure
    }
  }
}

function parseEnvPort(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/**
 * Runs read-only diagnostic checks for Knife and returns a structured report.
 */
export async function runDoctorChecks(
  options: DoctorOptions,
  deps?: DoctorDeps,
): Promise<DoctorReport> {
  const platform = deps?.platform ?? process.platform;
  const arch = deps?.arch ?? process.arch;
  const env = deps?.env ?? process.env;
  const cwd = deps?.cwd ?? process.cwd();
  const packageRoot = deps?.packageRoot ?? getPackageRoot();
  const runner = deps?.runner ?? defaultRunner;
  const fetchFn = deps?.fetchFn ?? fetch;
  const isWslFn = deps?.isWslFn ?? isWsl;
  const currentVersion = deps?.currentVersion ?? getCurrentVersion(packageRoot);

  const checks: DoctorCheckResult[] = [];

  // 1. Platform
  if (platform === "linux") {
    const wslTag = isWslFn() ? " [WSL]" : "";
    checks.push({
      id: "platform",
      label: "Platform",
      status: "pass",
      message: `${platform} (${arch})${wslTag}`,
    });
  } else if (platform === "darwin") {
    checks.push({
      id: "platform",
      label: "Platform",
      status: "warn",
      message: `${platform} (${arch}) — best-effort support`,
      hint: "Linux is the primary target; live CWD tracking via /proc is Linux-only.",
    });
  } else {
    checks.push({
      id: "platform",
      label: "Platform",
      status: "fail",
      message: `Unsupported platform '${platform}' (${arch})`,
      hint: "Knife supports Linux (primary) and macOS (best-effort); Windows is unsupported.",
    });
  }

  // 2. Bun Runtime
  const bunVersion = detectBunVersion(deps, runner);
  const bunExec = deps?.bunExecutable ?? (bunVersion ? resolveBunExecutable(runner, platform) : "");
  if (!bunVersion) {
    checks.push({
      id: "bun",
      label: "Bun Runtime",
      status: "fail",
      message: "Bun runtime not found",
      hint: "Install Bun v1.2+ from https://bun.sh",
    });
  } else if (compareSemver(bunVersion, "1.2.0") < 0) {
    checks.push({
      id: "bun",
      label: "Bun Runtime",
      status: "fail",
      message: `Bun v${bunVersion} found (${bunExec}), requires v1.2.0+`,
      hint: "Upgrade Bun with: bun upgrade",
    });
  } else {
    checks.push({
      id: "bun",
      label: "Bun Runtime",
      status: "pass",
      message: `Bun v${bunVersion} (${bunExec})`,
    });
  }

  // 3. Client Build
  const pkgBuildDir = join(packageRoot, "build", "client");
  const cwdBuildDir = join(cwd, "build", "client");
  const buildDir = existsSync(join(pkgBuildDir, "index.html"))
    ? pkgBuildDir
    : existsSync(join(cwdBuildDir, "index.html"))
      ? cwdBuildDir
      : null;

  if (!buildDir) {
    checks.push({
      id: "build",
      label: "Client Build",
      status: "fail",
      message: "Client build not found (expected build/client/index.html)",
      hint: isSourceCheckout(packageRoot)
        ? "Run 'bun run build' in the repository root."
        : "Reinstall @kilip/knife or run 'knife self-update --force'.",
    });
  } else {
    const missingPwa: string[] = [];
    if (!existsSync(join(buildDir, "sw.js"))) missingPwa.push("sw.js");
    if (!existsSync(join(buildDir, "manifest.webmanifest")))
      missingPwa.push("manifest.webmanifest");

    if (missingPwa.length > 0) {
      checks.push({
        id: "build",
        label: "Client Build",
        status: "warn",
        message: `Client bundle found at ${buildDir}, missing PWA assets (${missingPwa.join(", ")})`,
        hint: "Rebuild client bundle with 'bun run build'.",
      });
    } else {
      checks.push({
        id: "build",
        label: "Client Build",
        status: "pass",
        message: `Client bundle present at ${buildDir}`,
      });
    }
  }

  // 4. Login Shell
  const shellPath = deps?.shellPath ?? getUserShell();
  if (!existsSync(shellPath)) {
    checks.push({
      id: "shell",
      label: "Login Shell",
      status: "fail",
      message: `Login shell not found at '${shellPath}'`,
      hint: "Set $SHELL to an installed shell (e.g. /bin/bash or /bin/zsh).",
    });
  } else if (platform !== "win32") {
    try {
      accessSync(shellPath, constants.X_OK);
      checks.push({
        id: "shell",
        label: "Login Shell",
        status: "pass",
        message: `Login shell '${shellPath}' is executable`,
      });
    } catch {
      checks.push({
        id: "shell",
        label: "Login Shell",
        status: "fail",
        message: `Login shell '${shellPath}' is not executable`,
        hint: "Check permissions or set $SHELL to a valid executable shell.",
      });
    }
  } else {
    checks.push({
      id: "shell",
      label: "Login Shell",
      status: "pass",
      message: `Login shell '${shellPath}' found`,
    });
  }

  // 5. PTY Engine
  const ptyResult = (deps?.testPty ?? defaultTestPty)();
  if (ptyResult.ok) {
    checks.push({
      id: "pty",
      label: "PTY Engine",
      status: "pass",
      message: "Bun.Terminal PTY allocation succeeded",
    });
  } else {
    checks.push({
      id: "pty",
      label: "PTY Engine",
      status: "fail",
      message: `PTY engine check failed: ${ptyResult.error || "Unknown error"}`,
      hint: "Verify Bun v1.2+ and OS PTY availability (/dev/ptmx).",
    });
  }

  // 6. Configuration (read-only)
  const configPath = resolveDoctorConfigPath(options.configPath, cwd, platform, env);
  const configExists = existsSync(configPath);
  let parsedConfig: Partial<KnifeConfig> | null = null;
  let configValid = false;
  let isFirstRun = true;

  let effectiveHost = options.host || env.KNIFE_HOST || DEFAULT_CONFIG.host;
  const envPort = parseEnvPort(env.KNIFE_PORT);
  let effectivePort = options.port ?? envPort ?? DEFAULT_CONFIG.port;

  if (!configExists) {
    if (!validateHost(effectiveHost) || !validatePort(effectivePort)) {
      checks.push({
        id: "config",
        label: "Configuration",
        status: "fail",
        message: !validateHost(effectiveHost)
          ? `Invalid listen host '${effectiveHost}'`
          : `Invalid listen port '${effectivePort}'`,
        hint: "Fix KNIFE_HOST / KNIFE_PORT or CLI flags.",
      });
      if (!validateHost(effectiveHost)) effectiveHost = DEFAULT_CONFIG.host;
      if (!validatePort(effectivePort)) effectivePort = DEFAULT_CONFIG.port;
    } else {
      checks.push({
        id: "config",
        label: "Configuration",
        status: "warn",
        message: `No config.json found (expected ${configPath}); first-run setup mode active`,
        hint: "Run 'knife onboarding' or start Knife to complete first-run setup.",
      });
    }
  } else {
    try {
      const raw = readFileSync(configPath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Config root must be a JSON object");
      }
      const cfg = parsed as Partial<KnifeConfig>;

      if (
        cfg.auth?.allowedUserId !== undefined &&
        (typeof cfg.auth.allowedUserId !== "number" ||
          !Number.isInteger(cfg.auth.allowedUserId) ||
          cfg.auth.allowedUserId <= 0)
      ) {
        throw new Error("allowedUserId must be a positive integer");
      }

      if (cfg.host !== undefined && (typeof cfg.host !== "string" || !validateHost(cfg.host))) {
        throw new Error(`invalid host '${String(cfg.host)}'`);
      }

      if (cfg.port !== undefined && (typeof cfg.port !== "number" || !validatePort(cfg.port))) {
        throw new Error(`invalid port '${String(cfg.port)}'`);
      }

      effectiveHost = options.host || env.KNIFE_HOST || cfg.host || DEFAULT_CONFIG.host;
      effectivePort = options.port ?? envPort ?? cfg.port ?? DEFAULT_CONFIG.port;

      if (!validateHost(effectiveHost)) {
        throw new Error(`invalid listen host '${effectiveHost}'`);
      }
      if (!validatePort(effectivePort)) {
        throw new Error(`invalid listen port '${String(effectivePort)}'`);
      }

      parsedConfig = cfg;
      configValid = true;
      isFirstRun = !(
        cfg.publicDomain &&
        cfg.auth?.githubClientId &&
        (cfg.auth?.allowedUsername || cfg.auth?.allowedUserId)
      );

      if (isFirstRun) {
        checks.push({
          id: "config",
          label: "Configuration",
          status: "warn",
          message: `Config at ${configPath} is incomplete (first-run setup mode)`,
          hint: "Complete setup via 'knife onboarding' or the web wizard.",
        });
      } else {
        const scheme = cfg.publicScheme || DEFAULT_CONFIG.publicScheme;
        const userLabel =
          cfg.auth?.allowedUsername || `id:${String(cfg.auth?.allowedUserId ?? "unknown")}`;
        checks.push({
          id: "config",
          label: "Configuration",
          status: "pass",
          message: `Valid config at ${configPath} (${scheme}://${cfg.publicDomain}, user: ${userLabel})`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      effectiveHost = DEFAULT_CONFIG.host;
      effectivePort = DEFAULT_CONFIG.port;
      checks.push({
        id: "config",
        label: "Configuration",
        status: "fail",
        message: `Invalid configuration at ${configPath}: ${msg}`,
        hint: "Fix or regenerate config.json before starting Knife.",
      });
    }
  }

  // 7. Config Permissions
  if (configExists && platform !== "win32") {
    try {
      const mode = statSync(configPath).mode & 0o777;
      const modeStr = mode.toString(8).padStart(3, "0");
      if ((mode & 0o077) !== 0) {
        checks.push({
          id: "config-permissions",
          label: "Config Permissions",
          status: "warn",
          message: `Config permissions ${modeStr} allow group/other access on ${configPath}`,
          hint: `Run: chmod 600 ${configPath}`,
        });
      } else {
        checks.push({
          id: "config-permissions",
          label: "Config Permissions",
          status: "pass",
          message: `Config permissions are restrictive (${modeStr})`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      checks.push({
        id: "config-permissions",
        label: "Config Permissions",
        status: "warn",
        message: `Could not inspect config permissions: ${msg}`,
      });
    }
  }

  // 8. Auth & Proxy Hygiene
  if (configValid && parsedConfig && !isFirstRun) {
    if (!parsedConfig.auth?.githubClientId || !parsedConfig.auth?.githubClientSecret) {
      checks.push({
        id: "security",
        label: "Auth & Proxy Hygiene",
        status: "fail",
        message: "GitHub OAuth credentials (githubClientId / githubClientSecret) are incomplete",
        hint: "Re-run setup or update auth fields in config.json.",
      });
    } else {
      const securityWarnings: string[] = [];
      const scheme = parsedConfig.publicScheme || DEFAULT_CONFIG.publicScheme;
      if (scheme !== "https") {
        securityWarnings.push(
          `publicScheme is '${scheme}' (HTTPS recommended behind TLS-terminating proxy)`,
        );
      }
      if (effectiveHost === "0.0.0.0" || effectiveHost === "::") {
        securityWarnings.push(
          `Listening on '${effectiveHost}' exposes plain HTTP outside loopback`,
        );
      }

      if (securityWarnings.length > 0) {
        checks.push({
          id: "security",
          label: "Auth & Proxy Hygiene",
          status: "warn",
          message: securityWarnings.join("; "),
          hint: "Prefer listening on 127.0.0.1 with publicScheme='https' behind Caddy/Nginx.",
        });
      } else {
        const pinNote = parsedConfig.auth.allowedUserId
          ? `allowedUserId pinned (${parsedConfig.auth.allowedUserId})`
          : "allowedUserId will pin on first OAuth login";
        checks.push({
          id: "security",
          label: "Auth & Proxy Hygiene",
          status: "pass",
          message: `GitHub OAuth configured, HTTPS scheme, loopback bind (${pinNote})`,
        });
      }
    }
  }

  // 9. Data Directory (strictly read-only)
  const dataDir = resolveDoctorDataDir(configPath, cwd, env);
  if (existsSync(dataDir)) {
    let dirOk = true;
    try {
      if (!statSync(dataDir).isDirectory()) {
        dirOk = false;
        checks.push({
          id: "data-dir",
          label: "Data Directory",
          status: "fail",
          message: `Data path '${dataDir}' exists but is not a directory`,
          hint: "Remove the conflicting file or set KNIFE_DATA_DIR to a directory.",
        });
      } else {
        accessSync(dataDir, constants.R_OK | constants.W_OK);
      }
    } catch {
      dirOk = false;
      checks.push({
        id: "data-dir",
        label: "Data Directory",
        status: "fail",
        message: `Data directory '${dataDir}' is not readable/writable`,
        hint: "Check directory ownership and permissions.",
      });
    }

    if (dirOk) {
      const stateIssues: string[] = [];
      const tabsPath = join(dataDir, "tabs.json");
      if (existsSync(tabsPath)) {
        try {
          const parsedTabs: unknown = JSON.parse(readFileSync(tabsPath, "utf-8"));
          if (!Array.isArray(parsedTabs)) {
            stateIssues.push("tabs.json is not a JSON array");
          }
        } catch {
          stateIssues.push("tabs.json is invalid JSON or unreadable");
        }
      }

      const settingsPath = join(dataDir, "settings.json");
      if (existsSync(settingsPath)) {
        try {
          const parsedSettings: unknown = JSON.parse(readFileSync(settingsPath, "utf-8"));
          if (
            typeof parsedSettings !== "object" ||
            parsedSettings === null ||
            Array.isArray(parsedSettings)
          ) {
            stateIssues.push("settings.json is not a JSON object");
          }
        } catch {
          stateIssues.push("settings.json is invalid JSON or unreadable");
        }
      }

      if (stateIssues.length > 0) {
        checks.push({
          id: "data-dir",
          label: "Data Directory",
          status: "warn",
          message: `Data directory ${dataDir} accessible, but ${stateIssues.join("; ")}`,
          hint: "Inspect or back up corrupt state files before starting Knife.",
        });
      } else {
        checks.push({
          id: "data-dir",
          label: "Data Directory",
          status: "pass",
          message: `Data directory writable at ${dataDir}`,
        });
      }
    }
  } else {
    let probe = dirname(dataDir);
    while (!existsSync(probe)) {
      const parent = dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }

    let parentWritable = false;
    if (existsSync(probe)) {
      try {
        accessSync(probe, constants.W_OK);
        parentWritable = true;
      } catch {
        parentWritable = false;
      }
    }

    if (parentWritable) {
      checks.push({
        id: "data-dir",
        label: "Data Directory",
        status: "pass",
        message: `Data directory (${dataDir}) does not exist yet; parent '${probe}' is writable`,
      });
    } else {
      checks.push({
        id: "data-dir",
        label: "Data Directory",
        status: "fail",
        message: `Data directory (${dataDir}) cannot be created (parent '${probe}' is not writable)`,
        hint: "Set KNIFE_DATA_DIR to a writable location.",
      });
    }
  }

  // 10. Background Service
  const svc = await detectInstalledService({
    name: options.serviceName,
    system: options.system,
    platform,
    runner,
  });

  if (!svc.supported) {
    checks.push({
      id: "service",
      label: "Background Service",
      status: "info",
      message: `Background service management unsupported on '${platform}'`,
    });
  } else if (!svc.status?.installed) {
    checks.push({
      id: "service",
      label: "Background Service",
      status: "info",
      message: `No background service installed (${svc.displayName}, unit: ${svc.status?.unitPath ?? "unknown"})`,
      hint: "Install with 'knife service install' if you want Knife managed as a service.",
    });
  } else {
    const unitErrors: string[] = [];
    const unitWarnings: string[] = [];
    const unitPath = svc.status.unitPath;

    if (existsSync(unitPath)) {
      try {
        const unitContent = readFileSync(unitPath, "utf-8");
        const { bunPath, entrypointPath } = extractServiceUnitPaths(unitContent, platform);
        if (bunPath && !existsSync(bunPath)) {
          unitErrors.push(`service Bun binary missing: ${bunPath}`);
        }
        if (entrypointPath && !existsSync(entrypointPath)) {
          unitErrors.push(`service entrypoint missing: ${entrypointPath}`);
        } else if (entrypointPath) {
          const expectedEntrypoint = join(packageRoot, "server", "index.ts");
          if (resolve(entrypointPath) !== resolve(expectedEntrypoint)) {
            unitWarnings.push(
              `unit points to ${entrypointPath}, current CLI is ${expectedEntrypoint}`,
            );
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        unitWarnings.push(`could not read service unit: ${msg}`);
      }
    }

    let lingerDisabled = false;
    if (platform === "linux" && !svc.system) {
      const username =
        env.USER ||
        (() => {
          try {
            return os.userInfo()?.username;
          } catch {
            return undefined;
          }
        })();
      if (username) {
        const lingerRes = runner.run("loginctl", ["show-user", username, "--property=Linger"]);
        if (lingerRes.exitCode === 0 && lingerRes.stdout.toLowerCase().includes("linger=no")) {
          lingerDisabled = true;
          unitWarnings.push(
            `user lingering is disabled for '${username}' (service stops on logout)`,
          );
        }
      }
    }

    const scopeLabel = svc.system ? "system" : "user";
    const pidText = svc.status.pid ? `, PID ${svc.status.pid}` : "";

    if (svc.status.status === "failed" || unitErrors.length > 0) {
      checks.push({
        id: "service",
        label: "Background Service",
        status: "fail",
        message: `Service '${options.serviceName}' (${scopeLabel}) ${svc.status.status}${pidText}${
          unitErrors.length > 0 ? `: ${unitErrors.join("; ")}` : ""
        }`,
        hint:
          unitErrors.length > 0
            ? "Reinstall service unit with 'knife service install' to update paths."
            : "Inspect logs with 'knife service status'.",
      });
    } else if (svc.status.status === "running" && unitWarnings.length > 0) {
      checks.push({
        id: "service",
        label: "Background Service",
        status: "warn",
        message: `Service '${options.serviceName}' (${scopeLabel}) running${pidText}; ${unitWarnings.join("; ")}`,
        hint: lingerDisabled
          ? "Enable lingering with 'loginctl enable-linger' or run 'knife service install'."
          : "Run 'knife service install && knife service restart' if paths changed.",
      });
    } else if (svc.status.status === "running") {
      checks.push({
        id: "service",
        label: "Background Service",
        status: "pass",
        message: `Service '${options.serviceName}' (${scopeLabel}) active (running${pidText}) at ${unitPath}`,
      });
    } else {
      checks.push({
        id: "service",
        label: "Background Service",
        status: "warn",
        message: `Service '${options.serviceName}' (${scopeLabel}) is installed (${svc.status.status}) at ${unitPath}${
          unitWarnings.length > 0 ? `; ${unitWarnings.join("; ")}` : ""
        }`,
        hint: "Start service with 'knife service start'.",
      });
    }
  }

  // 11. Local Server Health Probe
  let connectHost = effectiveHost;
  if (connectHost === "0.0.0.0") connectHost = "127.0.0.1";
  else if (connectHost === "::") connectHost = "::1";
  const urlHost =
    connectHost.includes(":") && !connectHost.startsWith("[") ? `[${connectHost}]` : connectHost;
  const healthUrl = `http://${urlHost}:${effectivePort}/health`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetchFn(healthUrl, { signal: controller.signal });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { status?: unknown } | null;
      if (data && data.status === "ok") {
        checks.push({
          id: "server",
          label: "Local Server",
          status: "pass",
          message: `Knife server responding at ${healthUrl}`,
        });
      } else {
        checks.push({
          id: "server",
          label: "Local Server",
          status: "fail",
          message: `Port ${effectivePort} on ${connectHost} returned unexpected response (HTTP ${res.status})`,
          hint: "Another process may be using this port; check 'knife service status' or choose --port <n>.",
        });
      }
    } else {
      checks.push({
        id: "server",
        label: "Local Server",
        status: "fail",
        message: `Port ${effectivePort} on ${connectHost} returned unexpected response (HTTP ${res.status})`,
        hint: "Another process may be using this port; check 'knife service status' or choose --port <n>.",
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (svc.status?.active) {
      checks.push({
        id: "server",
        label: "Local Server",
        status: "fail",
        message: `Background service is active, but ${healthUrl} is unreachable (${msg})`,
        hint: "Check logs with 'knife service status'.",
      });
    } else {
      checks.push({
        id: "server",
        label: "Local Server",
        status: "info",
        message: `No local Knife server responding at ${healthUrl} (not running)`,
      });
    }
  } finally {
    clearTimeout(timer);
  }

  // 12. Version & Updates
  if (options.offline) {
    checks.push({
      id: "update",
      label: "Version & Updates",
      status: "info",
      message: `Version check skipped (--offline); current version v${currentVersion}`,
    });
  } else {
    const updateRes = await checkLatestVersion(currentVersion, true, fetchFn);
    if (updateRes.error) {
      checks.push({
        id: "update",
        label: "Version & Updates",
        status: "warn",
        message: `Could not check npm registry for updates (current v${currentVersion}): ${updateRes.error}`,
        hint: "Check network connectivity or run with --offline.",
      });
    } else if (updateRes.updateAvailable) {
      checks.push({
        id: "update",
        label: "Version & Updates",
        status: "warn",
        message: `Update available: v${updateRes.currentVersion} -> v${updateRes.latestVersion}`,
        hint: "Run 'knife self-update' to upgrade.",
      });
    } else {
      checks.push({
        id: "update",
        label: "Version & Updates",
        status: "pass",
        message: `Knife v${updateRes.currentVersion} is up to date (latest: v${updateRes.latestVersion})`,
      });
    }
  }

  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
    info: checks.filter((c) => c.status === "info").length,
  };

  return {
    version: currentVersion,
    ok: summary.fail === 0,
    summary,
    checks,
  };
}

/**
 * Formats a DoctorReport into human-readable ANSI terminal output.
 */
export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`Knife Doctor (v${report.version})\n`);

  const icons: Record<DoctorCheckStatus, string> = {
    pass: "\x1b[32m✓\x1b[0m",
    warn: "\x1b[33m!\x1b[0m",
    fail: "\x1b[31m✗\x1b[0m",
    info: "\x1b[36m-\x1b[0m",
  };

  for (const check of report.checks) {
    lines.push(`  ${icons[check.status]} ${check.label.padEnd(20)} ${check.message}`);
    if (check.hint) {
      lines.push(`      Fix: ${check.hint}`);
    }
  }

  lines.push(
    `\nSummary: ${report.summary.pass} passed, ${report.summary.warn} warnings, ${report.summary.fail} failed, ${report.summary.info} info`,
  );

  return lines.join("\n");
}
