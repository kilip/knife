import assert from "node:assert/strict";
import { BasePage } from "./BasePage";

export interface SetupFormInput {
  token: string;
  publicDomain?: string;
  githubClientId: string;
  githubClientSecret: string;
  allowedUsername: string;
}

/**
 * Page Object Model for `/setup` (first-run setup wizard).
 */
export class SetupPage extends BasePage {
  get heading() {
    return this.page.getByRole("heading", { name: /Knife Setup/i });
  }

  get tokenInput() {
    return this.page.locator("#setup-token");
  }

  get publicDomainInput() {
    return this.page.locator("#setup-public-domain");
  }

  get githubClientIdInput() {
    return this.page.locator("#setup-github-client-id");
  }

  get githubClientSecretInput() {
    return this.page.locator("#setup-github-client-secret");
  }

  get allowedUsernameInput() {
    return this.page.locator("#setup-allowed-username");
  }

  get submitButton() {
    return this.page.getByRole("button", { name: /Complete Setup & Continue/i });
  }

  async open(hash?: string): Promise<number> {
    const suffix = hash ? `#${hash.replace(/^#/, "")}` : "";
    return this.goto(`/setup${suffix}`);
  }

  async expectRendered(): Promise<void> {
    await this.heading.waitFor({ state: "visible" });
    await this.tokenInput.waitFor({ state: "visible" });
  }

  async getTokenValue(): Promise<string> {
    return this.tokenInput.inputValue();
  }

  async expectHashCleared(): Promise<void> {
    await this.page.waitForFunction(() => window.location.hash === "");
    assert.equal(new URL(this.page.url()).hash, "");
  }

  async fillAndSubmit(input: SetupFormInput): Promise<void> {
    await this.tokenInput.fill(input.token);
    if (input.publicDomain) {
      await this.publicDomainInput.fill(input.publicDomain);
    }
    await this.githubClientIdInput.fill(input.githubClientId);
    await this.githubClientSecretInput.fill(input.githubClientSecret);
    await this.allowedUsernameInput.fill(input.allowedUsername);
    await this.submitButton.click();
  }
}
