import { type IWorldOptions, setWorldConstructor, World } from "@cucumber/cucumber";
import type { BrowserContext, Page } from "playwright";
import { LoginPage } from "../pages/LoginPage";
import { SetupPage } from "../pages/SetupPage";
import { WorkspacePage } from "../pages/WorkspacePage";
import { KnifeServerHarness, type ServerBootMode } from "./server-harness";

export class KnifeWorld extends World {
  context!: BrowserContext;
  page!: Page;
  server: KnifeServerHarness | null = null;
  lastResponseStatus: number | null = null;
  pageErrors: string[] = [];
  consoleErrors: string[] = [];
  cspViolations: string[] = [];

  private _setupPage: SetupPage | null = null;
  private _loginPage: LoginPage | null = null;
  private _workspacePage: WorkspacePage | null = null;

  constructor(options: IWorldOptions) {
    super(options);
  }

  async startServer(mode: ServerBootMode): Promise<KnifeServerHarness> {
    if (this.server) {
      await this.server.stop();
    }
    this.server = new KnifeServerHarness();
    await this.server.start(mode);
    this._setupPage = null;
    this._loginPage = null;
    this._workspacePage = null;
    return this.server;
  }

  get baseUrl(): string {
    if (!this.server) {
      throw new Error("Server harness has not been started for this scenario");
    }
    return this.server.baseUrl;
  }

  get setupPage(): SetupPage {
    if (!this._setupPage) {
      this._setupPage = new SetupPage(this.page, this.baseUrl);
    }
    return this._setupPage;
  }

  get loginPage(): LoginPage {
    if (!this._loginPage) {
      this._loginPage = new LoginPage(this.page, this.baseUrl);
    }
    return this._loginPage;
  }

  get workspacePage(): WorkspacePage {
    if (!this._workspacePage) {
      this._workspacePage = new WorkspacePage(this.page, this.baseUrl);
    }
    return this._workspacePage;
  }
}

setWorldConstructor(KnifeWorld);
