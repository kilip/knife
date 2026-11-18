import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { After, AfterAll, Before, BeforeAll, Status, setDefaultTimeout } from "@cucumber/cucumber";
import { type Browser, chromium } from "playwright";
import type { KnifeWorld } from "./world";

setDefaultTimeout(30 * 1000);

let browser: Browser | null = null;

BeforeAll(async () => {
  const indexHtml = join(process.cwd(), "build", "client", "index.html");
  if (!existsSync(indexHtml)) {
    throw new Error("build/client/index.html not found. Run `bun run build` before `bun run e2e`.");
  }

  browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false",
  });
});

Before(async function (this: KnifeWorld) {
  if (!browser) {
    throw new Error("Playwright Chromium browser was not initialized");
  }

  this.context = await browser.newContext();
  this.pageErrors = [];
  this.consoleErrors = [];
  this.cspViolations = [];
  this.lastResponseStatus = null;

  await this.context.addInitScript(() => {
    const win = window as unknown as { __knifeCspViolations?: string[] };
    win.__knifeCspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      win.__knifeCspViolations?.push(`${event.violatedDirective}: ${event.blockedURI || "inline"}`);
    });
  });

  this.page = await this.context.newPage();

  this.page.on("pageerror", (error) => {
    this.pageErrors.push(error.message);
  });

  this.page.on("console", (msg) => {
    if (msg.type() === "error") {
      this.consoleErrors.push(msg.text());
    }
  });
});

After(async function (this: KnifeWorld, scenario) {
  try {
    if (scenario.result?.status === Status.FAILED && this.page) {
      const artifactsDir = join(process.cwd(), "e2e", "artifacts");
      mkdirSync(artifactsDir, { recursive: true });
      const slug = scenario.pickle.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      await this.page.screenshot({
        path: join(artifactsDir, `failed-${slug}-${Date.now()}.png`),
        fullPage: true,
      });
    }
  } finally {
    await this.context?.close();
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
  }
});

AfterAll(async () => {
  await browser?.close();
  browser = null;
});
