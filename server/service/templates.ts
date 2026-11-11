import type { ResolvedServiceContext } from "./types";

/**
 * Escapes an argument for systemd ExecStart syntax.
 * Values with spaces, quotes, or special characters are wrapped in double quotes.
 */
export function escapeSystemdArg(arg: string): string {
  if (/[\s"'\\]/.test(arg)) {
    const escaped = arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return arg;
}

/**
 * Generates a systemd unit file content (.service).
 */
export function renderSystemdUnit(ctx: ResolvedServiceContext): string {
  const wantedBy = ctx.system ? "multi-user.target" : "default.target";
  const execArgs = [ctx.bunPath, "run", ctx.entrypointPath, ...ctx.cliArgs]
    .map(escapeSystemdArg)
    .join(" ");

  const envLines = Object.entries(ctx.env)
    .map(([key, value]) => {
      const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `Environment="${key}=${escaped}"`;
    })
    .join("\n");

  return `[Unit]
Description=Knife - Web Terminal & File Browser (${ctx.name})
Documentation=https://github.com/kilip/knife
After=network.target

[Service]
Type=simple
WorkingDirectory=${escapeSystemdArg(ctx.workingDir)}
ExecStart=${execArgs}
Restart=always
RestartSec=3
${envLines}

[Install]
WantedBy=${wantedBy}
`;
}

/**
 * Escapes characters for XML attributes and text content.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates a macOS launchd property list (.plist).
 */
export function renderLaunchdPlist(ctx: ResolvedServiceContext): string {
  const serviceLabel = `com.kilip.${ctx.name}`;
  const programArgs = [ctx.bunPath, "run", ctx.entrypointPath, ...ctx.cliArgs]
    .map((arg) => `    <string>${escapeXml(arg)}</string>`)
    .join("\n");

  const envEntries = Object.entries(ctx.env)
    .map(([key, val]) => `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(val)}</string>`)
    .join("\n");

  const stdoutLog = `${ctx.logDir}/stdout.log`;
  const stderrLog = `${ctx.logDir}/stderr.log`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(serviceLabel)}</string>
  <key>ProgramArguments</key>
  <array>
${programArgs}
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(ctx.workingDir)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
${envEntries}
  </dict>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutLog)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrLog)}</string>
</dict>
</plist>
`;
}

/**
 * Generates a Windows batch runner script (.cmd) for Windows Task Scheduler or SCM.
 */
export function renderWindowsRunnerScript(ctx: ResolvedServiceContext): string {
  const setEnvLines = Object.entries(ctx.env)
    .map(([key, val]) => `@set "${key}=${val}"`)
    .join("\r\n");

  const execArgs = [ctx.entrypointPath, ...ctx.cliArgs]
    .map((a) => (a.includes(" ") ? `"${a}"` : a))
    .join(" ");

  const stdoutLog = `${ctx.logDir}\\stdout.log`;
  const stderrLog = `${ctx.logDir}\\stderr.log`;

  return `@echo off\r
${setEnvLines}\r
cd /d "${ctx.workingDir}"\r
"${ctx.bunPath}" run ${execArgs} >> "${stdoutLog}" 2>> "${stderrLog}"\r
`;
}
