import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildServicePath,
  getPlatformPaths,
  resolveBunExecutable,
  resolveEntrypointPath,
} from "./paths";
import { defaultRunner } from "./runner";
import type {
  CommandRunner,
  DiscoveredConfigInfo,
  ResolvedServiceContext,
  ServiceCliOptions,
} from "./types";

/**
 * Searches for an existing configuration in order of precedence:
 * 1. CLI explicit --config
 * 2. KNIFE_CONFIG_PATH environment variable
 * 3. ./config.json in current working directory
 * 4. Standard OS user config path (~/.config/knife/config.json, etc.)
 */
export function discoverExistingConfig(
  cliOptions: Partial<ServiceCliOptions> = {},
  cwd: string = process.cwd(),
  platform: NodeJS.Platform = process.platform,
): DiscoveredConfigInfo {
  const platformPaths = getPlatformPaths(cliOptions.name || "knife", platform);
  const candidates: string[] = [];

  if (cliOptions.configPath) {
    candidates.push(resolve(cwd, cliOptions.configPath));
  }
  if (process.env.KNIFE_CONFIG_PATH) {
    candidates.push(resolve(process.env.KNIFE_CONFIG_PATH));
  }
  candidates.push(resolve(cwd, "config.json"));
  candidates.push(resolve(platformPaths.userConfigDir, "config.json"));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const raw = readFileSync(candidate, "utf-8");
        const parsed = JSON.parse(raw);
        const resolvedWorkingDir = cliOptions.workingDir
          ? resolve(cwd, cliOptions.workingDir)
          : dirname(candidate);
        const resolvedDataDir = process.env.KNIFE_DATA_DIR || join(resolvedWorkingDir, "data");

        return {
          configPath: candidate,
          exists: true,
          workingDir: resolvedWorkingDir,
          dataDir: resolvedDataDir,
          host: parsed.host,
          port: parsed.port,
          publicDomain: parsed.publicDomain,
          publicScheme: parsed.publicScheme,
        };
      } catch {
        // Corrupted JSON or unreadable, continue to next candidate
      }
    }
  }

  // Fallback when no existing config is found
  const resolvedWorkingDir = cliOptions.workingDir ? resolve(cwd, cliOptions.workingDir) : cwd;
  const targetConfig = cliOptions.configPath
    ? resolve(cwd, cliOptions.configPath)
    : resolve(resolvedWorkingDir, "config.json");
  const targetDataDir = process.env.KNIFE_DATA_DIR || join(resolvedWorkingDir, "data");

  return {
    configPath: targetConfig,
    exists: false,
    workingDir: resolvedWorkingDir,
    dataDir: targetDataDir,
  };
}

/**
 * Builds the fully resolved execution context for the daemon service.
 */
export function buildResolvedServiceContext(
  options: ServiceCliOptions,
  cwd: string = process.cwd(),
  runner: CommandRunner = defaultRunner,
  platform: NodeJS.Platform = process.platform,
): ResolvedServiceContext {
  const discovered = discoverExistingConfig(options, cwd, platform);
  const platformPaths = getPlatformPaths(options.name, platform);

  const bunPath = resolveBunExecutable(runner, platform);
  const entrypointPath = resolveEntrypointPath();

  const workingDir = options.workingDir ? resolve(cwd, options.workingDir) : discovered.workingDir;
  const configPath = options.configPath ? resolve(cwd, options.configPath) : discovered.configPath;
  const dataDir = discovered.dataDir;
  const logDir = options.system ? platformPaths.systemLogDir : platformPaths.userLogDir;

  // Build CLI arguments to pass to the daemon process
  const cliArgs: string[] = ["--config", configPath];
  if (options.host) {
    cliArgs.push("--host", options.host);
  } else if (discovered.host) {
    cliArgs.push("--host", discovered.host);
  }

  if (options.port) {
    cliArgs.push("--port", String(options.port));
  } else if (discovered.port) {
    cliArgs.push("--port", String(discovered.port));
  }

  if (options.domain) {
    cliArgs.push("--domain", options.domain);
  } else if (discovered.publicDomain) {
    cliArgs.push("--domain", discovered.publicDomain);
  }

  // Construct environment map
  const pathEnv = buildServicePath(bunPath, platform, process.env.PATH);
  const env: Record<string, string> = {
    PATH: pathEnv,
    NODE_ENV: "production",
    KNIFE_CONFIG_PATH: configPath,
    KNIFE_DATA_DIR: dataDir,
  };

  // Preserve critical shell and user variables
  if (process.env.SHELL) env.SHELL = process.env.SHELL;
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.env.USER) env.USER = process.env.USER;
  if (process.env.LOGNAME) env.LOGNAME = process.env.LOGNAME;
  if (process.env.LANG) env.LANG = process.env.LANG;
  if (process.env.LC_ALL) env.LC_ALL = process.env.LC_ALL;

  // Merge extra user-defined env flags
  for (const [key, value] of Object.entries(options.env)) {
    env[key] = value;
  }

  return {
    name: options.name,
    system: options.system,
    bunPath,
    entrypointPath,
    workingDir,
    configPath,
    configExists: discovered.exists,
    dataDir,
    logDir,
    cliArgs,
    env,
    discoveredConfig: discovered,
  };
}
