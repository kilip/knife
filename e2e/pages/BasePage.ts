import assert from "node:assert/strict";
import type { Page } from "playwright";

/**
 * Base Page Object Model providing shared navigation, URL assertions,
 * and CSP / runtime error verification.
 */
export class BasePage {
  constructor(
    protected readonly page: Page,
    protected readonly baseUrl: string,
  ) {}

  /**
   * Navigates to a path relative to the test server base URL and returns
   * the HTTP status code of the main document response.
   */
  async goto(path: string): Promise<number> {
    const response = await this.page.goto(`${this.baseUrl}${path}`, {
      waitUntil: "domcontentloaded",
    });
    assert.ok(response, `Expected HTTP response when navigating to ${path}`);
    return response.status();
  }

  /**
   * Waits until the browser URL pathname matches `expectedPathname`.
   */
  async expectPathname(expectedPathname: string): Promise<void> {
    await this.page.waitForFunction(
      (expected) => window.location.pathname === expected,
      expectedPathname,
    );
    const actual = new URL(this.page.url()).pathname;
    assert.equal(actual, expectedPathname);
  }

  /**
   * Reads CSP violations captured in the page context via `securitypolicyviolation`.
   */
  async getCspViolations(): Promise<string[]> {
    return this.page.evaluate(() => {
      const win = window as unknown as { __knifeCspViolations?: string[] };
      return win.__knifeCspViolations ?? [];
    });
  }
}
