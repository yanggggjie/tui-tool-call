/**
 * Wraps a PTY process (@homebridge/node-pty-prebuilt-multiarch).
 * Uses @xterm/headless as a VT renderer — PTY output is written into
 * the terminal emulator, and snapshot() reads back plain text.
 */
import * as fs from "fs";
import * as path from "path";
import * as pty from "@homebridge/node-pty-prebuilt-multiarch";
import { Terminal } from "@xterm/headless";
import { SessionInfo } from "./protocol";

const POLL_MS = 100;
const STABLE_POLLS = 10;

/** Letters and digits only: dev, tempwork, agent1 */
export const SESSION_NAME_PATTERN = /^[a-zA-Z0-9]+$/;

export function validateSessionName(name: string): string | null {
  if (!name?.trim()) {
    return "session name is required (e.g. dev, tempwork, agent)";
  }
  if (!SESSION_NAME_PATTERN.test(name)) {
    return (
      `invalid session name "${name}": use letters and digits only ` +
      "(e.g. dev, tempwork, agent)"
    );
  }
  return null;
}

export function validateCwd(cwd: string): string | null {
  if (!cwd?.trim()) {
    return "cwd is required";
  }
  const resolved = path.resolve(cwd);
  try {
    if (!fs.statSync(resolved).isDirectory()) {
      return `not a directory: ${cwd}`;
    }
  } catch {
    return `directory not found: ${cwd}`;
  }
  return null;
}

export class Session {
  readonly name: string;

  private ptyProcess: pty.IPty;
  private terminal: Terminal;
  private _status: "running" | "exited" = "running";
  private _exitCode: number | null = null;
  private outputLog: string = "";
  private streamListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(exitCode: number | null) => void> = [];

  constructor(
    name: string,
    command: string[],
    options: { cwd: string; cols?: number; rows?: number }
  ) {
    this.name = name;

    const cols = options.cols ?? 120;
    const rows = options.rows ?? 30;
    const [file, ...args] = command;

    this.terminal = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 10000 });

    this.ptyProcess = pty.spawn(file, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: options.cwd,
      env: process.env as { [key: string]: string },
    });

    this.ptyProcess.onData((data: string) => {
      this.terminal.write(data);
      this.appendOutput(data);
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this._status = "exited";
      this._exitCode = exitCode ?? null;
      this.notifyExitListeners(this._exitCode);
    });
  }

  get status(): "running" | "exited" {
    return this._status;
  }

  get exitCode(): number | null {
    return this._exitCode;
  }

  get cols(): number {
    return this.terminal.cols;
  }

  get rows(): number {
    return this.terminal.rows;
  }

  getStreamReplay(): string {
    return this.outputLog;
  }

  onStream(listener: (data: string) => void): () => void {
    this.streamListeners.push(listener);
    return () => {
      this.streamListeners = this.streamListeners.filter((l) => l !== listener);
    };
  }

  onExit(listener: (exitCode: number | null) => void): () => void {
    this.exitListeners.push(listener);
    return () => {
      this.exitListeners = this.exitListeners.filter((l) => l !== listener);
    };
  }

  send(text: string): void {
    if (this._status === "exited") {
      throw new Error(`Session ${this.name} has already exited`);
    }
    const interpreted = text
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
    this.ptyProcess.write(interpreted);
  }

  press(key: string): void {
    if (this._status === "exited") {
      throw new Error(`Session ${this.name} has already exited`);
    }
    this.ptyProcess.write(key);
  }

  private readPlainScreen(): string {
    const buf = this.terminal.buffer.active;
    const lines: string[] = [];
    const startY = buf.viewportY;
    for (let i = 0; i < this.terminal.rows; i++) {
      lines.push((buf.getLine(startY + i)?.translateToString(true) ?? "").trimEnd());
    }
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    while (lines.length > 0 && lines[0] === "") lines.shift();
    return lines.join("\n");
  }

  snapshot(): string {
    return this.readPlainScreen();
  }

  /** Poll every 100ms; 10 consecutive unchanged reads → done. */
  async wait(): Promise<string> {
    if (this._status === "exited") {
      return this.snapshot();
    }

    let lastScreen = this.readPlainScreen();
    let stableCount = 0;

    while (stableCount < STABLE_POLLS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      if (this._status !== "running") break;

      const current = this.readPlainScreen();
      if (current === lastScreen) {
        stableCount++;
      } else {
        stableCount = 0;
        lastScreen = current;
      }
    }

    return this.snapshot();
  }

  kill(): void {
    if (this._status === "running") {
      this.ptyProcess.kill();
    }
  }

  toInfo(): SessionInfo {
    return { session_name: this.name };
  }

  scrollLines(lines: number): void {
    this.terminal.scrollLines(lines);
  }

  scrollUp(lines?: number): void {
    const n = lines ?? this.terminal.rows;
    this.scrollLines(-n);
  }

  scrollDown(lines?: number): void {
    const n = lines ?? this.terminal.rows;
    this.scrollLines(n);
  }

  scrollTop(): void {
    const buf = this.terminal.buffer.active;
    this.scrollLines(-buf.viewportY);
  }

  scrollBottom(): void {
    const buf = this.terminal.buffer.active;
    const target = Math.max(0, buf.length - this.terminal.rows);
    this.scrollLines(target - buf.viewportY);
  }

  scroll(direction: "up" | "down" | "top" | "bottom"): void {
    switch (direction) {
      case "up":
        this.scrollUp();
        break;
      case "down":
        this.scrollDown();
        break;
      case "top":
        this.scrollTop();
        break;
      case "bottom":
        this.scrollBottom();
        break;
    }
  }

  private appendOutput(data: string): void {
    const maxBytes = 512 * 1024;
    this.outputLog += data;
    if (this.outputLog.length > maxBytes) {
      this.outputLog = this.outputLog.slice(-maxBytes);
    }
    const listeners = [...this.streamListeners];
    for (const listener of listeners) {
      listener(data);
    }
  }

  private notifyExitListeners(exitCode: number | null): void {
    const listeners = [...this.exitListeners];
    this.exitListeners = [];
    for (const listener of listeners) {
      listener(exitCode);
    }
  }
}
