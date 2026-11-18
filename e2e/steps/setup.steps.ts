import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";
import type { KnifeWorld } from "../support/world";

When(
  "the user visits {string} with the one-time setup token in the URL fragment",
  async function (this: KnifeWorld, path: string) {
    assert.equal(path, "/setup");
    assert.ok(this.server?.setupToken, "Expected setup token from first-run server");
    this.lastResponseStatus = await this.setupPage.open(`token=${this.server.setupToken}`);
  },
);

When(
  "submits a valid setup configuration for {string}",
  async function (this: KnifeWorld, allowedUsername: string) {
    assert.ok(this.server?.setupToken, "Expected setup token from first-run server");
    await this.setupPage.expectRendered();
    await this.setupPage.fillAndSubmit({
      token: this.server.setupToken,
      publicDomain: `127.0.0.1:${this.server.port}`,
      githubClientId: "e2e-github-client-id",
      githubClientSecret: "e2e-github-client-secret",
      allowedUsername,
    });
  },
);

Then("the setup page should be rendered", async function (this: KnifeWorld) {
  await this.setupPage.expectRendered();
});

Then(
  "the setup token field should be pre-filled with the server setup token",
  async function (this: KnifeWorld) {
    assert.ok(this.server?.setupToken, "Expected setup token from first-run server");
    await this.setupPage.expectRendered();
    const actualValue = await this.setupPage.getTokenValue();
    assert.equal(actualValue, this.server.setupToken);
  },
);

Then("the URL fragment should be cleared", async function (this: KnifeWorld) {
  await this.setupPage.expectHashCleared();
});
