import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import type { KnifeWorld } from "../support/world";

Given("a Knife server running in first-run mode", async function (this: KnifeWorld) {
  await this.startServer("first-run");
});

Given("a Knife server running in configured mode", async function (this: KnifeWorld) {
  await this.startServer("configured");
});

When("the user visits {string}", async function (this: KnifeWorld, path: string) {
  this.lastResponseStatus = await this.setupPage.goto(path);
});

Then(
  "the HTTP response status should be {int}",
  function (this: KnifeWorld, expectedStatus: number) {
    assert.equal(this.lastResponseStatus, expectedStatus);
  },
);

Then("the browser should be on {string}", async function (this: KnifeWorld, expectedPath: string) {
  await this.setupPage.expectPathname(expectedPath);
});

Then("there should be no CSP or runtime page errors", async function (this: KnifeWorld) {
  const cspViolations = await this.setupPage.getCspViolations();
  assert.deepEqual(cspViolations, [], `Unexpected CSP violations: ${cspViolations.join("; ")}`);
  assert.deepEqual(this.pageErrors, [], `Unexpected page errors: ${this.pageErrors.join("; ")}`);
  assert.deepEqual(
    this.consoleErrors,
    [],
    `Unexpected console errors: ${this.consoleErrors.join("; ")}`,
  );
});
