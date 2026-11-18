import assert from "node:assert/strict";
import { BasePage } from "./BasePage";

/**
 * Page Object Model for `/login`.
 */
export class LoginPage extends BasePage {
  get heading() {
    return this.page.getByRole("heading", { name: /knife/i });
  }

  get signInWithGithubButton() {
    return this.page.getByRole("button", { name: /Sign in with GitHub/i });
  }

  async open(): Promise<number> {
    return this.goto("/login");
  }

  async expectRendered(): Promise<void> {
    await this.heading.waitFor({ state: "visible" });
    await this.signInWithGithubButton.waitFor({ state: "visible" });
    assert.equal(await this.signInWithGithubButton.isEnabled(), true);
  }
}
