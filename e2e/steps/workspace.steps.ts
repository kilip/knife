import assert from "node:assert/strict";
import { Given, Then } from "@cucumber/cucumber";
import type { KnifeWorld } from "../support/world";

Given(
  "the browser has a valid session cookie for {string}",
  async function (this: KnifeWorld, username: string) {
    assert.ok(this.server, "Expected server harness to be running");
    const cookie = this.server.createSessionCookie(username);
    await this.context.addCookies([cookie]);
  },
);

Then("the terminal workspace should be rendered", async function (this: KnifeWorld) {
  await this.workspacePage.expectTerminalReady();
});
