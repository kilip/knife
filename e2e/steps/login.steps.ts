import { Then } from "@cucumber/cucumber";
import type { KnifeWorld } from "../support/world";

Then("the login page should be rendered", async function (this: KnifeWorld) {
  await this.loginPage.expectRendered();
});
