import { BasePage } from "./BasePage";

/**
 * Page Object Model for `/` (authenticated terminal workspace).
 */
export class WorkspacePage extends BasePage {
  get xtermContainer() {
    return this.page.locator(".xterm").first();
  }

  get newTabButton() {
    return this.page
      .locator('button[title="New Tab (Ctrl+Alt+T)"]')
      .or(this.page.getByRole("button", { name: /New Terminal/i }));
  }

  async open(): Promise<number> {
    return this.goto("/");
  }

  async expectTerminalReady(): Promise<void> {
    await this.xtermContainer.waitFor({ state: "visible" });
  }
}
