import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildResolvedServiceContext } from "./config";
import { getServiceManager } from "./factory";
import { defaultRunner } from "./runner";
import type { CommandRunner, ServiceAction, ServiceCliOptions, ServiceStatusResult } from "./types";

export * from "./types";
export * from "./paths";
export * from "./config";
export { SystemdServiceManager } from "./managers/systemd";
export { LaunchdServiceManager } from "./managers/launchd";
export { WindowsServiceManager } from "./managers/windows";
export * from "./templates";
export * from "./factory";
export * from "./runner";

const VALID_ACTIONS: ServiceAction[] = [
  "install",
  "uninstall",
  "start",
  "stop",
  "status",
  "restart",
];

export function printServiceHelp(): void {
  console.log(`
Knife Background Service Management

Usage:
  knife service <command> [options]
  knife service:<command> [options]

Commands:
  install       Install and register Knife as an OS background service
  uninstall     Stop and remove Knife background service registration
  start         Start the background service
  stop          Stop the background service
  restart       Restart the background service
  status        Show current status, PID, and recent logs

Options:
  --user        Install as user-level service/agent (default)
  --system      Install as system-wide daemon (requires sudo/administrator)
  --name <str>  Custom service name (default: "knife")
  --dir <path>  Working directory for the service
  --config <path> Explicit path to config.json (auto-discovers existing config by default)
  -p, --port <p> Explicit listen port override
  --host <ip>   Explicit listen host override
  -d, --domain  Explicit public domain override
  --env <K=V>   Extra environment variable to inject (can be repeated)
  -h, --help    Show this help message
`);
}

/**
 * Parses CLI arguments to detect and extract service subcommands.
 * Returns null if the command is not a service invocation.
 */
export function parseServiceCliArgs(args: string[]): ServiceCliOptions | null {
  if (args.length === 0) {
    return null;
  }

  const first = args[0];
  let action: ServiceAction | undefined;
  let remainingArgs = args.slice(1);

  if (first.startsWith("service:")) {
    const rawAction = first.slice("service:".length).toLowerCase() as ServiceAction;
    if (VALID_ACTIONS.includes(rawAction)) {
      action = rawAction;
    }
  } else if (first === "service") {
    if (remainingArgs.length > 0 && !remainingArgs[0].startsWith("-")) {
      const rawAction = remainingArgs[0].toLowerCase() as ServiceAction;
      if (VALID_ACTIONS.includes(rawAction)) {
        action = rawAction;
        remainingArgs = remainingArgs.slice(1);
      }
    } else {
      // "knife service" with no action or with flags like --help
      return {
        action: "status",
        name: "knife",
        system: false,
        env: {},
        help: true,
      };
    }
  }

  if (!action) {
    return null;
  }

  const options: ServiceCliOptions = {
    action,
    name: "knife",
    system: false,
    env: {},
    help: false,
  };

  for (let i = 0; i < remainingArgs.length; i++) {
    const arg = remainingArgs[i];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--system") {
      options.system = true;
    } else if (arg === "--user") {
      options.system = false;
    } else if (arg === "--name" && i + 1 < remainingArgs.length) {
      options.name = remainingArgs[++i];
    } else if (arg.startsWith("--name=")) {
      options.name = arg.slice("--name=".length);
    } else if (arg === "--dir" && i + 1 < remainingArgs.length) {
      options.workingDir = remainingArgs[++i];
    } else if (arg.startsWith("--dir=")) {
      options.workingDir = arg.slice("--dir=".length);
    } else if (arg === "--config" && i + 1 < remainingArgs.length) {
      options.configPath = remainingArgs[++i];
    } else if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
    } else if ((arg === "-p" || arg === "--port") && i + 1 < remainingArgs.length) {
      options.port = parseInt(remainingArgs[++i], 10);
    } else if (arg.startsWith("--port=")) {
      options.port = parseInt(arg.slice("--port=".length), 10);
    } else if (arg === "--host" && i + 1 < remainingArgs.length) {
      options.host = remainingArgs[++i];
    } else if (arg.startsWith("--host=")) {
      options.host = arg.slice("--host=".length);
    } else if ((arg === "-d" || arg === "--domain") && i + 1 < remainingArgs.length) {
      options.domain = remainingArgs[++i];
    } else if (arg.startsWith("--domain=")) {
      options.domain = arg.slice("--domain=".length);
    } else if (arg === "--env" && i + 1 < remainingArgs.length) {
      const pair = remainingArgs[++i];
      const eqIdx = pair.indexOf("=");
      if (eqIdx > 0) {
        options.env[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
      }
    } else if (arg.startsWith("--env=")) {
      const pair = arg.slice("--env=".length);
      const eqIdx = pair.indexOf("=");
      if (eqIdx > 0) {
        options.env[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
      }
    }
  }

  return options;
}

export function formatStatusOutput(status: ServiceStatusResult): string {
  const lines: string[] = [];

  let statusSymbol = "\x1b[32m●\x1b[0m"; // Green
  let statusText = "\x1b[32mactive (running)\x1b[0m";

  if (status.status === "stopped") {
    statusSymbol = "\x1b[90m○\x1b[0m";
    statusText = "\x1b[90minactive (stopped)\x1b[0m";
  } else if (status.status === "failed") {
    statusSymbol = "\x1b[31m▲\x1b[0m";
    statusText = "\x1b[31mfailed\x1b[0m";
  } else if (status.status === "not-installed") {
    statusSymbol = "\x1b[33m?\x1b[0m";
    statusText = "\x1b[33mnot installed\x1b[0m";
  }

  lines.push(`${statusSymbol} Knife Service - ${statusText}`);
  lines.push(`  Service Unit:  ${status.unitPath}`);
  if (status.pid) {
    lines.push(`  PID:           ${status.pid}`);
  }
  if (status.uptime) {
    lines.push(`  Started:       ${status.uptime}`);
  }
  if (status.listenUrl) {
    lines.push(`  Listening:     \x1b[36m${status.listenUrl}\x1b[0m`);
  }
  if (status.setupUrl) {
    lines.push(
      `  Setup URL:     \x1b[33m\x1b[1m${status.setupUrl}\x1b[0m (first-run setup active)`,
    );
  }

  if (status.recentLogs && status.recentLogs.length > 0) {
    lines.push("\nRecent Logs:");
    for (const logLine of status.recentLogs.slice(-8)) {
      lines.push(`  ${logLine}`);
    }
  }

  return lines.join("\n");
}

/**
 * Main dispatcher for service commands.
 * Returns true if a service command was processed, false otherwise.
 */
export async function handleServiceCommand(
  args: string[],
  runner: CommandRunner = defaultRunner,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  const cliOptions = parseServiceCliArgs(args);
  if (!cliOptions) {
    return false;
  }

  if (cliOptions.help) {
    printServiceHelp();
    return true;
  }

  const manager = getServiceManager(platform, runner);

  switch (cliOptions.action) {
    case "install": {
      const ctx = buildResolvedServiceContext(cliOptions, process.cwd(), runner, platform);

      // Pre-install client build check
      const clientBuildPath = join(import.meta.dir, "..", "..", "build", "client", "index.html");
      const clientBuildDir = join(import.meta.dir, "..", "..", "build", "client");
      if (!existsSync(clientBuildPath) && !existsSync(clientBuildDir)) {
        console.warn(
          "\x1b[33m[notice] Client build directory ('build/client') was not found.\x1b[0m",
        );
        console.warn(
          "         Remember to run 'bun run build' so Knife can serve the web interface.",
        );
      }

      if (ctx.configExists) {
        console.log(`\x1b[32m✓\x1b[0m Found existing configuration at: ${ctx.configPath}`);
        console.log(
          `  Reusing settings (Host: ${ctx.discoveredConfig.host || "127.0.0.1"}, Port: ${
            ctx.discoveredConfig.port || 3000
          }) for service.`,
        );
      } else {
        console.log(`[notice] No existing config.json found. Target config: ${ctx.configPath}`);
      }

      const result = await manager.install(ctx);
      console.log(`\x1b[32m✓\x1b[0m Service unit written to: ${result.unitPath}`);
      console.log(`\x1b[32m✓\x1b[0m Registered with ${manager.displayName}`);

      if (result.lingerEnabled) {
        console.log(
          `\x1b[32m✓\x1b[0m User lingering verified/enabled (service persists across logouts).`,
        );
      }

      for (const warning of result.warnings) {
        console.warn(`\x1b[33m!\x1b[0m ${warning}`);
      }

      console.log(`\nNext steps:`);
      console.log(`  Start service:  \x1b[36mknife service start\x1b[0m`);
      console.log(`  Check status:   \x1b[36mknife service status\x1b[0m\n`);
      break;
    }

    case "uninstall": {
      const res = await manager.uninstall(cliOptions);
      if (res.removedPath) {
        console.log(`\x1b[32m✓\x1b[0m Removed unit file: ${res.removedPath}`);
      }
      console.log(`\x1b[32m✓\x1b[0m Service '${cliOptions.name}' uninstalled successfully.`);
      break;
    }

    case "start": {
      await manager.start(cliOptions);
      console.log(`\x1b[32m✓\x1b[0m Service '${cliOptions.name}' started successfully.`);
      break;
    }

    case "stop": {
      await manager.stop(cliOptions);
      console.log(`\x1b[32m✓\x1b[0m Service '${cliOptions.name}' stopped successfully.`);
      break;
    }

    case "restart": {
      await manager.restart(cliOptions);
      console.log(`\x1b[32m✓\x1b[0m Service '${cliOptions.name}' restarted successfully.`);
      break;
    }

    case "status": {
      const statusRes = await manager.status(cliOptions);
      console.log(formatStatusOutput(statusRes));
      break;
    }
  }

  return true;
}
