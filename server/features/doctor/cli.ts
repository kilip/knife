import { validateHost, validatePort } from "../../config";
import { type DoctorDeps, type DoctorOptions, formatDoctorReport, runDoctorChecks } from "./doctor";

export function printDoctorHelp(log: (line: string) => void = console.log): void {
  log(`
Knife Environment & Health Diagnostics

Usage:
  knife doctor [options]

Options:
  --config <path>       Path to config.json to inspect
  --host <ip>           Override listen host for health check
  -p, --port <port>     Override listen port for health check
  --name <str>          Background service name to inspect (default: "knife")
  --user                Inspect user-level background service
  --system              Inspect system-wide background service
  --offline             Skip npm registry update check
  --json                Emit machine-readable JSON report
  -h, --help            Show this help message
`);
}

function readOptionValue(args: string[], index: number, flag: string): string {
  const next = args[index + 1];
  if (next === undefined || next.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return next;
}

function parsePortOption(raw: string): number {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid port '${raw}'. Port must be an integer between 1 and 65535.`);
  }
  const port = Number(trimmed);
  if (!validatePort(port)) {
    throw new Error(`Invalid port '${raw}'. Port must be an integer between 1 and 65535.`);
  }
  return port;
}

function validateHostOption(host: string): string {
  if (!validateHost(host)) {
    throw new Error(
      `Invalid host '${host}'. Host must be a valid IPv4/IPv6 address, 'localhost', or '0.0.0.0'.`,
    );
  }
  return host;
}

/**
 * Parses CLI arguments for `knife doctor`.
 * Returns null if the command is not a doctor invocation.
 */
export function parseDoctorCliArgs(args: string[]): DoctorOptions | null {
  if (args.length === 0 || args[0] !== "doctor") {
    return null;
  }

  const options: DoctorOptions = {
    serviceName: "knife",
    offline: false,
    json: false,
    help: false,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--offline") {
      options.offline = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--user") {
      options.system = false;
    } else if (arg === "--system") {
      options.system = true;
    } else if (arg === "--config") {
      options.configPath = readOptionValue(args, i, "--config");
      i++;
    } else if (arg.startsWith("--config=")) {
      const val = arg.slice("--config=".length);
      if (!val) throw new Error("Missing value for --config");
      options.configPath = val;
    } else if (arg === "--host") {
      options.host = validateHostOption(readOptionValue(args, i, "--host"));
      i++;
    } else if (arg.startsWith("--host=")) {
      const val = arg.slice("--host=".length);
      if (!val) throw new Error("Missing value for --host");
      options.host = validateHostOption(val);
    } else if (arg === "-p" || arg === "--port") {
      options.port = parsePortOption(readOptionValue(args, i, arg));
      i++;
    } else if (arg.startsWith("--port=")) {
      const val = arg.slice("--port=".length);
      if (!val) throw new Error("Missing value for --port");
      options.port = parsePortOption(val);
    } else if (arg === "--name") {
      options.serviceName = readOptionValue(args, i, "--name");
      i++;
    } else if (arg.startsWith("--name=")) {
      const val = arg.slice("--name=".length);
      if (!val) throw new Error("Missing value for --name");
      options.serviceName = val;
    } else {
      throw new Error(`Unknown option or argument for 'doctor': ${arg}`);
    }
  }

  return options;
}

/**
 * Main CLI dispatcher for `knife doctor`.
 * Returns null if `args` is not a doctor invocation, otherwise an exit code.
 */
export async function handleDoctorCommand(
  args: string[],
  deps?: DoctorDeps & { log?: (line: string) => void },
): Promise<number | null> {
  const options = parseDoctorCliArgs(args);
  if (!options) {
    return null;
  }

  const log = deps?.log ?? console.log;
  if (options.help) {
    printDoctorHelp(log);
    return 0;
  }

  const report = await runDoctorChecks(options, deps);
  if (options.json) {
    log(JSON.stringify(report, null, 2));
  } else {
    log(formatDoctorReport(report));
  }

  return report.ok ? 0 : 1;
}
