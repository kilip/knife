import { spawn } from "node:child_process";
import { detectInstalledService } from "../../service";
import type { CommandRunner } from "../../service/types";
import {
  buildPackageManagerInfo,
  checkLatestVersion,
  compareSemver,
  detectPackageManager,
  executePackageUpdate,
  type FetchLike,
  getCurrentVersion,
  getPackageRoot,
  isSourceCheckout,
  isValidTargetVersion,
  type PackageManager,
  type PackageManagerInfo,
  parseSemver,
} from "./update";

export interface SelfUpdateCliOptions {
  check: boolean;
  force: boolean;
  noRestart: boolean;
  version?: string;
  packageManager?: PackageManager;
  serviceName: string;
  system?: boolean;
  help: boolean;
}

export interface SelfUpdateDeps {
  currentVersion?: string;
  packageRoot?: string;
  platform?: NodeJS.Platform;
  runner?: CommandRunner;
  fetchFn?: FetchLike;
  spawnFn?: typeof spawn;
  detectPm?: (targetVersion?: string) => PackageManagerInfo;
  log?: (line: string) => void;
  warn?: (line: string) => void;
  error?: (line: string) => void;
}

export function printSelfUpdateHelp(log: (line: string) => void = console.log): void {
  log(`
Knife Self-Update

Usage:
  knife self-update [options]

Options:
  --check              Check npm registry for available updates without installing
  --version <ver>      Install a specific version or dist-tag (default: latest)
  --pm <bun|npm>       Package manager to use (default: auto-detect)
  -f, --force          Reinstall even if already up to date or in a source checkout
  --no-restart         Do not automatically restart an active background service
  --name <str>         Background service name to inspect/restart (default: "knife")
  --user               Target user-level background service
  --system             Target system-wide background service
  -h, --help           Show this help message
`);
}

function readOptionValue(args: string[], index: number, flag: string): string {
  const next = args[index + 1];
  if (next === undefined || next.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return next;
}

function normalizeTargetVersion(raw: string): string {
  if (!raw || !isValidTargetVersion(raw)) {
    throw new Error(`Invalid target version or dist-tag '${raw}'`);
  }
  return parseSemver(raw) ? raw.replace(/^v/i, "") : raw;
}

function parsePackageManagerOption(raw: string): PackageManager {
  const normalized = raw.toLowerCase();
  if (normalized === "bun" || normalized === "npm") {
    return normalized;
  }
  throw new Error(`Invalid package manager '${raw}'. Expected 'bun' or 'npm'.`);
}

/**
 * Parses CLI arguments for `knife self-update`.
 * Returns null if the command is not a self-update invocation.
 */
export function parseSelfUpdateCliArgs(args: string[]): SelfUpdateCliOptions | null {
  if (args.length === 0 || args[0] !== "self-update") {
    return null;
  }

  const options: SelfUpdateCliOptions = {
    check: false,
    force: false,
    noRestart: false,
    serviceName: "knife",
    help: false,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--check") {
      options.check = true;
    } else if (arg === "-f" || arg === "--force") {
      options.force = true;
    } else if (arg === "--no-restart") {
      options.noRestart = true;
    } else if (arg === "--user") {
      options.system = false;
    } else if (arg === "--system") {
      options.system = true;
    } else if (arg === "--version") {
      const val = readOptionValue(args, i, "--version");
      i++;
      options.version = normalizeTargetVersion(val);
    } else if (arg.startsWith("--version=")) {
      const val = arg.slice("--version=".length);
      if (!val) {
        throw new Error("Missing value for --version");
      }
      options.version = normalizeTargetVersion(val);
    } else if (arg === "--pm") {
      const val = readOptionValue(args, i, "--pm");
      i++;
      options.packageManager = parsePackageManagerOption(val);
    } else if (arg.startsWith("--pm=")) {
      const val = arg.slice("--pm=".length);
      if (!val) {
        throw new Error("Missing value for --pm");
      }
      options.packageManager = parsePackageManagerOption(val);
    } else if (arg === "--name") {
      const val = readOptionValue(args, i, "--name");
      i++;
      options.serviceName = val;
    } else if (arg.startsWith("--name=")) {
      const val = arg.slice("--name=".length);
      if (!val) {
        throw new Error("Missing value for --name");
      }
      options.serviceName = val;
    } else {
      throw new Error(`Unknown option or argument for 'self-update': ${arg}`);
    }
  }

  return options;
}

/**
 * Executes the `knife self-update` command and returns an exit code.
 */
export async function runSelfUpdate(
  options: SelfUpdateCliOptions,
  deps?: SelfUpdateDeps,
): Promise<number> {
  const log = deps?.log ?? console.log;
  const warn = deps?.warn ?? console.warn;
  const error = deps?.error ?? console.error;
  const packageRoot = deps?.packageRoot ?? getPackageRoot();
  const currentVersion = deps?.currentVersion ?? getCurrentVersion(packageRoot);
  const sourceCheckout = isSourceCheckout(packageRoot);
  const requestedTarget = options.version ?? "latest";
  const fetchFn = deps?.fetchFn ?? fetch;
  const spawnFn = deps?.spawnFn ?? spawn;

  if (sourceCheckout && !options.check && !options.force) {
    warn(`\x1b[33m!\x1b[0m Knife is running from a local git checkout (${packageRoot}).`);
    warn("  Update from source with: git pull && bun install && bun run build");
    warn("  Or pass --force to install globally from npm anyway.");
    return 1;
  }

  const checkRes = await checkLatestVersion(currentVersion, true, fetchFn, requestedTarget);

  if (checkRes.error) {
    if (options.check || !options.force) {
      error(
        `\x1b[31m✗\x1b[0m Failed to resolve '${requestedTarget}' from npm registry: ${checkRes.error}`,
      );
      if (!options.check) {
        error("  Run with --force to attempt installation anyway.");
      }
      return 1;
    }
    warn(
      `\x1b[33m!\x1b[0m Registry check failed (${checkRes.error}); continuing because --force was specified.`,
    );
  }

  const cmp = compareSemver(checkRes.latestVersion, currentVersion);

  if (options.check) {
    const originNote = sourceCheckout ? " (source checkout)" : "";
    log(`Current version: v${currentVersion}${originNote}`);
    log(`Target (${requestedTarget}): v${checkRes.latestVersion}`);
    if (cmp > 0) {
      log(`\x1b[33m!\x1b[0m Update available: v${currentVersion} -> v${checkRes.latestVersion}`);
      log("  Run 'knife self-update' to install.");
    } else if (cmp === 0) {
      log(`\x1b[32m✓\x1b[0m Knife is up to date (v${currentVersion}).`);
    } else {
      log(
        `\x1b[36m-\x1b[0m Current version (v${currentVersion}) is ahead of '${requestedTarget}' (v${checkRes.latestVersion}).`,
      );
    }
    return 0;
  }

  if (!options.force && !checkRes.error) {
    const shouldSkip = options.version ? cmp === 0 : cmp <= 0;
    if (shouldSkip) {
      if (cmp === 0) {
        log(`\x1b[32m✓\x1b[0m Knife is already at v${currentVersion}.`);
      } else {
        log(
          `\x1b[32m✓\x1b[0m Knife (v${currentVersion}) is already newer than '${requestedTarget}' (v${checkRes.latestVersion}).`,
        );
      }
      return 0;
    }
  }

  const pkgManager = options.packageManager
    ? buildPackageManagerInfo(options.packageManager, requestedTarget)
    : deps?.detectPm
      ? deps.detectPm(requestedTarget)
      : detectPackageManager(
          process.execPath,
          process.env,
          typeof Bun !== "undefined",
          requestedTarget,
        );

  const manualCommand = `${pkgManager.command} ${pkgManager.args.join(" ")}`;
  log(
    `Updating @kilip/knife from v${currentVersion} to ${
      checkRes.error ? requestedTarget : `v${checkRes.latestVersion}`
    }...`,
  );

  const updateRes = await executePackageUpdate(log, pkgManager, spawnFn);
  if (!updateRes.success) {
    error(`\x1b[31m✗\x1b[0m Self-update failed: ${updateRes.error || "Update command failed"}`);
    error(`  Manual command: ${manualCommand}`);
    return 1;
  }

  const svc = await detectInstalledService({
    name: options.serviceName,
    system: options.system,
    platform: deps?.platform,
    runner: deps?.runner,
  });

  if (svc.supported && svc.status?.installed && svc.status.active && svc.manager) {
    const nameFlag = options.serviceName !== "knife" ? ` --name ${options.serviceName}` : "";
    const restartCmd = svc.system
      ? `sudo knife service restart --system${nameFlag}`
      : `knife service restart${nameFlag}`;

    if (options.noRestart) {
      warn(
        `\x1b[33m!\x1b[0m Background service '${options.serviceName}' is active and was not restarted (--no-restart).`,
      );
      warn(`  Run '${restartCmd}' to apply the update.`);
    } else {
      try {
        await svc.manager.restart({
          action: "restart",
          name: options.serviceName,
          system: svc.system ?? false,
          env: {},
        });
        log(`\x1b[32m✓\x1b[0m Restarted background service '${options.serviceName}'.`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        warn(
          `\x1b[33m!\x1b[0m Update installed, but failed to restart service '${options.serviceName}': ${msg}`,
        );
        warn(`  Run '${restartCmd}' manually.`);
        return 1;
      }
    }
  } else if (svc.supported && svc.status?.installed) {
    log(
      `Notice: Background service '${options.serviceName}' is installed but not active. Start it with 'knife service start'.`,
    );
  } else {
    log("Notice: Restart any running Knife process to load the updated version.");
  }

  const targetDisplay = checkRes.error ? requestedTarget : `v${checkRes.latestVersion}`;
  log(`\x1b[32m✓\x1b[0m Knife updated (v${currentVersion} -> ${targetDisplay}).`);
  return 0;
}

/**
 * Main CLI dispatcher for `knife self-update`.
 * Returns null if `args` is not a self-update invocation, otherwise an exit code.
 */
export async function handleSelfUpdateCommand(
  args: string[],
  deps?: SelfUpdateDeps,
): Promise<number | null> {
  const options = parseSelfUpdateCliArgs(args);
  if (!options) {
    return null;
  }

  if (options.help) {
    printSelfUpdateHelp(deps?.log);
    return 0;
  }

  return runSelfUpdate(options, deps);
}
