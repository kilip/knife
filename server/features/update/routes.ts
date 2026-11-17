import { Hono } from "hono";
import {
  checkLatestVersion,
  detectPackageManager,
  executePackageUpdate,
  getCurrentVersion,
  isManagedService,
  triggerRestart,
} from "./update";

export interface UpdateRoutesDeps {
  getTabsCount: () => number;
}

export function createUpdateRoutes(deps: UpdateRoutesDeps) {
  const router = new Hono();

  router.get("/check", async (c) => {
    const force = c.req.query("force") === "true";
    const currentVersion = getCurrentVersion();
    const checkRes = await checkLatestVersion(currentVersion, force);
    const isService = await isManagedService("knife");
    const activeTabsCount = deps.getTabsCount();
    const pkgManager = detectPackageManager();

    return c.json({
      currentVersion: checkRes.currentVersion,
      latestVersion: checkRes.latestVersion,
      updateAvailable: checkRes.updateAvailable,
      cached: checkRes.cached ?? false,
      isService,
      activeTabsCount,
      command: `${pkgManager.command} ${pkgManager.args.join(" ")}`,
    });
  });

  router.post("/apply", async (c) => {
    const pkgManager = detectPackageManager();
    const isService = await isManagedService("knife");
    const remediationCommand = `${pkgManager.command} ${pkgManager.args.join(" ")}`;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const sendEvent = (event: string, data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        sendEvent("log", {
          line: `[update] Starting self-update via ${pkgManager.command}...`,
        });
        sendEvent("log", { line: `[update] Command: ${remediationCommand}` });

        const updateResult = await executePackageUpdate((line) => {
          sendEvent("log", { line });
        }, pkgManager);

        if (!updateResult.success) {
          sendEvent("error", {
            error: updateResult.error || "Update command failed",
            remediationCommand,
          });
          controller.close();
          return;
        }

        sendEvent("log", { line: "[update] Initiating server restart..." });
        sendEvent("complete", {
          message: "Update installed successfully. Server is restarting.",
          isService,
        });

        triggerRestart({
          isService,
          serviceName: "knife",
        });

        controller.close();
      },
    });

    const streamHeaders = new Headers();
    streamHeaders.set("Content-Type", "text/event-stream; charset=utf-8");
    streamHeaders.set("Cache-Control", "no-cache, no-transform");
    streamHeaders.set("Connection", "keep-alive");
    return new Response(stream, { headers: streamHeaders });
  });

  return router;
}
