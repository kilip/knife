import type { ResolvedServiceContext } from "./types";

export { escapeSystemdArg, renderSystemdUnit } from "./managers/systemd";

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
