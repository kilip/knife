export type ServiceAction = "install" | "uninstall" | "start" | "stop" | "status" | "restart";

export interface ServiceCliOptions {
  action: ServiceAction;
  name: string;
  system: boolean;
  workingDir?: string;
  configPath?: string;
  host?: string;
  port?: number;
  domain?: string;
  env: Record<string, string>;
  help?: boolean;
}

export interface DiscoveredConfigInfo {
  configPath: string;
  exists: boolean;
  workingDir: string;
  dataDir: string;
  host?: string;
  port?: number;
  publicDomain?: string;
  publicScheme?: "http" | "https";
}

export interface ResolvedServiceContext {
  name: string;
  system: boolean;
  bunPath: string;
  entrypointPath: string;
  workingDir: string;
  configPath: string;
  configExists: boolean;
  dataDir: string;
  logDir: string;
  cliArgs: string[];
  env: Record<string, string>;
  discoveredConfig: DiscoveredConfigInfo;
}

export interface ServiceStatusResult {
  installed: boolean;
  active: boolean;
  status: "running" | "stopped" | "failed" | "not-installed" | "unknown";
  pid?: number;
  uptime?: string;
  unitPath: string;
  configPath?: string;
  workingDir?: string;
  listenUrl?: string;
  setupUrl?: string;
  recentLogs: string[];
  rawOutput?: string;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(
    cmd: string,
    args: string[],
    options?: { cwd?: string; env?: Record<string, string> },
  ): CommandResult;
}

export interface ServiceInstallResult {
  unitPath: string;
  warnings: string[];
  lingerEnabled?: boolean;
}

export interface ServiceManager {
  readonly platform: string;
  readonly displayName: string;
  getUnitPath(name: string, system: boolean): string;
  install(ctx: ResolvedServiceContext): Promise<ServiceInstallResult>;
  uninstall(options: ServiceCliOptions): Promise<{ removedPath?: string }>;
  start(options: ServiceCliOptions): Promise<void>;
  stop(options: ServiceCliOptions): Promise<void>;
  restart(options: ServiceCliOptions): Promise<void>;
  status(options: ServiceCliOptions): Promise<ServiceStatusResult>;
}
