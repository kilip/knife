import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal } from "@xterm/headless";

export const MAX_SNAPSHOT_SCROLLBACK = 1000;

/**
 * Headless xterm.js screen & bounded scrollback tracker for accurate
 * reconnect replay without raw byte-slice corruption.
 */
export class ScreenSnapshot {
  private readonly term: Terminal;
  private readonly serializeAddon: SerializeAddon;
  private readonly scrollback: number;
  private pendingWrites = 0;
  private flushResolvers: Array<() => void> = [];
  private isDisposed = false;

  constructor(cols = 80, rows = 24, scrollback = MAX_SNAPSHOT_SCROLLBACK) {
    this.scrollback = scrollback;
    this.term = new Terminal({
      cols: Math.max(10, Math.floor(cols)),
      rows: Math.max(5, Math.floor(rows)),
      scrollback,
      allowProposedApi: true,
    });
    this.serializeAddon = new SerializeAddon();
    this.term.loadAddon(this.serializeAddon);
  }

  public get cols(): number {
    return this.term.cols;
  }

  public get rows(): number {
    return this.term.rows;
  }

  public write(data: string): void {
    if (this.isDisposed || data.length === 0) return;
    this.pendingWrites++;
    this.term.write(data, () => {
      this.pendingWrites = Math.max(0, this.pendingWrites - 1);
      if (this.pendingWrites === 0 && this.flushResolvers.length > 0) {
        const resolvers = this.flushResolvers.splice(0);
        for (const resolve of resolvers) {
          resolve();
        }
      }
    });
  }

  public resize(cols: number, rows: number): void {
    if (this.isDisposed) return;
    const safeCols = Math.max(10, Math.floor(cols));
    const safeRows = Math.max(5, Math.floor(rows));
    this.term.resize(safeCols, safeRows);
  }

  public async flush(): Promise<void> {
    if (this.isDisposed || this.pendingWrites === 0) return;
    await new Promise<void>((resolve) => {
      this.flushResolvers.push(resolve);
    });
  }

  public async getSnapshot(): Promise<string> {
    if (this.isDisposed) return "";
    await this.flush();
    if (this.isDisposed) return "";
    return this.serializeAddon.serialize({ scrollback: this.scrollback });
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.pendingWrites = 0;
    const resolvers = this.flushResolvers.splice(0);
    for (const resolve of resolvers) {
      resolve();
    }
    try {
      this.serializeAddon.dispose();
    } catch {}
    try {
      this.term.dispose();
    } catch {}
  }
}
