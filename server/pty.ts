import { readlinkSync } from "node:fs";
import { getUserShell } from "./shell";

export interface PtySessionOptions {
  sessionName: string;
  cols?: number;
  rows?: number;
  shellPath?: string;
  cwd?: string;
  onData?: (data: string) => void;
  onExit?: (code: number) => void;
}

export class PtySession {
  private term: InstanceType<typeof Bun.Terminal> | null = null;
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  public readonly sessionName: string;
  private isClosed: boolean = false;
  private outputBuffer: string = "";
  private readonly maxBufferSize: number = 128 * 1024; // 128 KB rolling buffer
  private onData?: (data: string) => void;
  private onExit?: (code: number) => void;

  constructor(options: PtySessionOptions) {
    this.sessionName = options.sessionName;
    this.onData = options.onData;
    this.onExit = options.onExit;

    const initialCols = Math.max(10, options.cols || 80);
    const initialRows = Math.max(5, options.rows || 24);
    const shell = options.shellPath || getUserShell();
    const cwd = options.cwd || process.env.HOME || "/";

    this.term = new Bun.Terminal({
      cols: initialCols,
      rows: initialRows,
      data: (_term, data) => {
        if (!this.isClosed) {
          const str = data.toString();
          this.outputBuffer += str;
          if (this.outputBuffer.length > this.maxBufferSize) {
            this.outputBuffer = this.outputBuffer.slice(
              this.outputBuffer.length - this.maxBufferSize,
            );
          }
          this.onData?.(str);
        }
      },
    });

    try {
      this.proc = Bun.spawn([shell, "-l"], {
        terminal: this.term,
        cwd,
        env: {
          ...process.env,
          SHELL: shell,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
          HOME: process.env.HOME || cwd,
          USER: process.env.USER || "user",
        },
      });

      this.proc.exited.then((code: number) => {
        if (!this.isClosed) {
          this.isClosed = true;
          try {
            this.term?.close();
          } catch {}
          this.onExit?.(code);
        }
      });
    } catch (err) {
      this.isClosed = true;
      try {
        this.term?.close();
      } catch {}
      throw err;
    }
  }

  public get isAlive(): boolean {
    return !this.isClosed;
  }

  public setDataCallback(cb?: (data: string) => void): void {
    this.onData = cb;
  }

  public setExitCallback(cb?: (code: number) => void): void {
    this.onExit = cb;
  }

  public clearCallbacks(): void {
    this.onData = undefined;
    this.onExit = undefined;
  }

  public getBuffer(): string {
    return this.outputBuffer;
  }

  public getCwd(): string | null {
    if (!this.proc?.pid) return null;
    try {
      return readlinkSync(`/proc/${this.proc.pid}/cwd`);
    } catch {
      return null;
    }
  }

  public write(data: string | Uint8Array): void {
    if (this.isClosed || !this.term) return;
    try {
      this.term.write(data);
    } catch (err) {
      console.error(`[pty] Error writing to terminal for ${this.sessionName}:`, err);
    }
  }

  public resize(cols: number, rows: number): void {
    if (this.isClosed || !this.term) return;
    const safeCols = Math.max(10, Math.floor(cols));
    const safeRows = Math.max(5, Math.floor(rows));
    try {
      this.term.resize(safeCols, safeRows);
      if (this.proc && !this.proc.killed) {
        this.proc.kill("SIGWINCH");
      }
    } catch (err) {
      console.error(`[pty] Error resizing terminal for ${this.sessionName}:`, err);
    }
  }

  public refresh(): void {
    // In direct PTY mode, terminal is controlled directly; no tmux refresh needed.
  }

  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    try {
      if (this.proc && !this.proc.killed) {
        this.proc.kill();
      }
    } catch {}
    try {
      this.term?.close();
    } catch {}
  }
}
