import { createApp } from "./app";
import { generateSetupToken, getPublicOrigin } from "./auth";
import {
  handleOnboardingCommand,
  handleServerBindError,
  parseCliOrExit,
  printFirstRunBanner,
  printStartupBanner,
} from "./cli";
import { loadConfig, saveConfig } from "./config";
import { initTabs } from "./features/tabs/store";
import { handleTerminalUpgrade, websocketHandler } from "./features/terminal/ws";

const cliArgs = await parseCliOrExit(process.argv.slice(2));
let { config, isFirstRun, configPath } = loadConfig(cliArgs);
if (cliArgs.onboarding) {
  await handleOnboardingCommand(cliArgs, config, isFirstRun);
}

let currentTabs = initTabs();

const app = createApp({
  getConfig: () => config,
  getIsFirstRun: () => isFirstRun,
  setIsFirstRun: (v) => {
    isFirstRun = v;
  },
  saveConfig: (cfg) => saveConfig(cfg, configPath),
  getTabs: () => currentTabs,
  setTabs: (tabs) => {
    currentTabs = tabs;
  },
});

try {
  Bun.serve({
    hostname: config.host,
    port: config.port,
    websocket: websocketHandler,
    fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/ws/terminal" || url.pathname.startsWith("/ws/terminal/")) {
        return handleTerminalUpgrade(req, server, config);
      }
      return app.fetch(req, { server });
    },
  });
  if (isFirstRun) {
    printFirstRunBanner(config, generateSetupToken());
  } else {
    printStartupBanner(config, getPublicOrigin(config));
  }
} catch (err) {
  handleServerBindError(err, config);
}
