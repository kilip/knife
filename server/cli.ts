import { type KnifeConfig, parseCliArgs } from "./config";
import { handleDoctorCommand } from "./features/doctor/cli";
import { handleSelfUpdateCommand } from "./features/update/cli";
import { handleServiceCommand } from "./service";
import { getServiceManager } from "./service/factory";

/**
 * Prints the Knife CLI usage help message.
 */
export function printCliHelp(): void {
  console.log(`
Usage: knife [command] [options]

Commands:
  onboarding            Start or attach to first-run setup and print the setup URL
  service <action>      Manage background service (install, uninstall, start, stop, status, restart)
  doctor                Run diagnostics and verify runtime, config, and service health
  self-update           Check for updates or upgrade @kilip/knife via package manager

Options:
  --host <ip>           Listen host address (default: 127.0.0.1 or KNIFE_HOST)
  -p, --port <port>     Listen port number (default: 3000 or KNIFE_PORT)
  -d, --domain <domain> Public domain (default: KNIFE_PUBLIC_DOMAIN or config.json)
  --config <path>       Path to config.json (default: ./config.json or KNIFE_CONFIG_PATH)
  -h, --help            Show help message
`);
}

/**
 * Prints the first-run setup banner when attaching to an already-running service.
 */
export function printRunningServiceSetupBanner(setupUrl: string): void {
  const tokenMatch = setupUrl.match(/[?&]token=([a-zA-Z0-9_-]+)/);
  console.log(`\n${"=".repeat(64)}`);
  console.log("  KNIFE - First Run Setup (Running Service)");
  console.log("=".repeat(64));
  console.log(`\n  \x1b[36m\x1b[1m${setupUrl}\x1b[0m\n`);
  if (tokenMatch) {
    console.log(`One-time Setup Token: \x1b[33m${tokenMatch[1]}\x1b[0m`);
  }
  console.log(`${"=".repeat(64)}\n`);
}

/**
 * Prints the first-run setup banner with the one-time setup URL and token.
 */
export function printFirstRunBanner(config: KnifeConfig, token: string): void {
  const displayHost = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
  const setupUrl = `http://${displayHost}:${config.port}/setup?token=${token}`;

  console.log(`\n${"=".repeat(64)}`);
  console.log("  KNIFE - First Run Setup");
  console.log("=".repeat(64));
  console.log("\nNo existing configuration found. Knife is running in setup mode.");
  if (config.publicDomain) {
    const publicSetupUrl = `${config.publicScheme}://${config.publicDomain}/setup?token=${token}`;
    console.log(`  Public: \x1b[36m\x1b[1m${publicSetupUrl}\x1b[0m`);
    console.log(`  Local:  \x1b[36m\x1b[1m${setupUrl}\x1b[0m\n`);
  } else {
    console.log(`  \x1b[36m\x1b[1m${setupUrl}\x1b[0m\n`);
  }
  console.log(`One-time Setup Token: \x1b[33m${token}\x1b[0m`);
  console.log(`${"=".repeat(64)}\n`);
}

/**
 * Prints the normal startup banner after the server binds and begins listening.
 */
export function printStartupBanner(config: KnifeConfig, origin: string): void {
  console.log(`\n${"=".repeat(64)}`);
  console.log("  KNIFE - Web Terminal");
  console.log("=".repeat(64));
  console.log(`Listening on:       http://${config.host}:${config.port}`);
  console.log(`Configured Public:  ${origin}`);
  console.log(`Allowed User:       ${config.auth?.allowedUsername}`);
  console.log(`GitHub Callback:    ${origin}/auth/github/callback`);
  console.log(`${"=".repeat(64)}\n`);
}

export async function handleOnboardingCommand(
  cliArgs: ReturnType<typeof parseCliArgs>,
  config: KnifeConfig,
  isFirstRun: boolean,
): Promise<void> {
  if (!isFirstRun) {
    console.log(`Knife is already configured (allowed user: ${config.auth?.allowedUsername}).`);
    console.log("Setup mode is only available before initial configuration.");
    process.exit(0);
  }
  if (!cliArgs.configPath) {
    try {
      const status = await getServiceManager(process.platform).status({
        action: "status",
        name: "knife",
        system: false,
        env: {},
        help: false,
      });
      if (
        status.active &&
        status.setupUrl &&
        (!cliArgs.port || status.setupUrl.includes(`:${cliArgs.port}/`))
      ) {
        printRunningServiceSetupBanner(status.setupUrl);
        process.exit(0);
      }
    } catch {
      // Service manager unavailable; fall through to start setup mode locally
    }
  }
}

export function handleServerBindError(err: unknown, config: KnifeConfig): never {
  const errorObj = err as { code?: string; message?: string };
  if (errorObj?.code === "EADDRINUSE" || errorObj?.message?.includes("address already in use")) {
    console.error("\n=======================================================");
    console.error(`FATAL: Port ${config.port} is already in use on ${config.host}.`);
    console.error("Please stop the existing process or choose a different port using:");
    console.error("  --port <number> or KNIFE_PORT=<number>");
    console.error("=======================================================\n");
  } else {
    console.error("Failed to start Knife server:", err);
  }
  process.exit(1);
}

export async function parseCliOrExit(argv: string[]) {
  try {
    if (await handleServiceCommand(argv)) {
      process.exit(0);
    }
    const doctorCode = await handleDoctorCommand(argv);
    if (doctorCode !== null) {
      process.exit(doctorCode);
    }
    const updateCode = await handleSelfUpdateCommand(argv);
    if (updateCode !== null) {
      process.exit(updateCode);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31mError:\x1b[0m ${msg}`);
    process.exit(1);
  }
  const cliArgs = parseCliArgs(argv);
  if (cliArgs.help) {
    printCliHelp();
    process.exit(0);
  }
  if (cliArgs.unknown?.length) {
    console.error(
      `\x1b[31mError:\x1b[0m Unknown command or argument: ${cliArgs.unknown.join(" ")}`,
    );
    console.error("Run 'knife --help' for usage.");
    process.exit(1);
  }
  return cliArgs;
}
