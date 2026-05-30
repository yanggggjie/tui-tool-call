/**
 * termlink/src/session.ts
 *
 * Wraps a PTY process (@homebridge/node-pty-prebuilt-multiarch).
 * Uses @xterm/headless as a VT renderer — all PTY output is written into
 * the terminal emulator, and `snapshot()` reads back the rendered screen.
 * This makes ANSI escape sequences, colors, and screen updates transparent.
 */
import * as pty from "@homebridge/node-pty-prebuilt-multiarch";
import { Terminal } from "@xterm/headless";
import { SessionInfo } from "./protocol";

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

// ---- ANSI re-encoding helpers ----

interface CellStyle {
  fg: number; fgMode: "default" | "palette" | "rgb";
  bg: number; bgMode: "default" | "palette" | "rgb";
  bold: boolean; dim: boolean; italic: boolean;
  underline: boolean; blink: boolean; inverse: boolean; strikethrough: boolean;
}

function getCellStyle(cell: { getFgColor(): number; getBgColor(): number; isFgDefault(): boolean; isFgPalette(): boolean; isFgRGB(): boolean; isBgDefault(): boolean; isBgPalette(): boolean; isBgRGB(): boolean; isBold(): number; isDim(): number; isItalic(): number; isUnderline(): number; isBlink(): number; isInverse(): number; isStrikethrough(): number }): CellStyle {
  return {
    fg: cell.getFgColor(),
    fgMode: cell.isFgDefault() ? "default" : cell.isFgPalette() ? "palette" : "rgb",
    bg: cell.getBgColor(),
    bgMode: cell.isBgDefault() ? "default" : cell.isBgPalette() ? "palette" : "rgb",
    bold: cell.isBold() !== 0,
    dim: cell.isDim() !== 0,
    italic: cell.isItalic() !== 0,
    underline: cell.isUnderline() !== 0,
    blink: cell.isBlink() !== 0,
    inverse: cell.isInverse() !== 0,
    strikethrough: cell.isStrikethrough() !== 0,
  };
}

function stylesEqual(a: CellStyle, b: CellStyle): boolean {
  return a.fg === b.fg && a.fgMode === b.fgMode &&
    a.bg === b.bg && a.bgMode === b.bgMode &&
    a.bold === b.bold && a.dim === b.dim && a.italic === b.italic &&
    a.underline === b.underline && a.blink === b.blink &&
    a.inverse === b.inverse && a.strikethrough === b.strikethrough;
}

function isDefaultStyle(s: CellStyle): boolean {
  return s.fgMode === "default" && s.bgMode === "default" &&
    !s.bold && !s.dim && !s.italic && !s.underline && !s.blink && !s.inverse && !s.strikethrough;
}

function styleToAnsi(s: CellStyle): string {
  const codes: string[] = [];
  if (s.bold) codes.push("1");
  if (s.dim) codes.push("2");
  if (s.italic) codes.push("3");
  if (s.underline) codes.push("4");
  if (s.blink) codes.push("5");
  if (s.inverse) codes.push("7");
  if (s.strikethrough) codes.push("9");
  if (s.fgMode === "palette") {
    if (s.fg < 8) codes.push(String(30 + s.fg));
    else if (s.fg < 16) codes.push(String(90 + s.fg - 8));
    else codes.push(`38;5;${s.fg}`);
  } else if (s.fgMode === "rgb") {
    codes.push(`38;2;${(s.fg >> 16) & 0xff};${(s.fg >> 8) & 0xff};${s.fg & 0xff}`);
  }
  if (s.bgMode === "palette") {
    if (s.bg < 8) codes.push(String(40 + s.bg));
    else if (s.bg < 16) codes.push(String(100 + s.bg - 8));
    else codes.push(`48;5;${s.bg}`);
  } else if (s.bgMode === "rgb") {
    codes.push(`48;2;${(s.bg >> 16) & 0xff};${(s.bg >> 8) & 0xff};${s.bg & 0xff}`);
  }
  if (codes.length === 0) return "";
  return `\x1b[${codes.join(";")}m`;
}

/** Minimal interface for an xterm buffer line (avoids importing concrete types). */
interface ColorBufferLine {
  getCell(x: number): { getChars(): string; getWidth(): number; getFgColor(): number; getBgColor(): number; isFgDefault(): boolean; isFgPalette(): boolean; isFgRGB(): boolean; isBgDefault(): boolean; isBgPalette(): boolean; isBgRGB(): boolean; isBold(): number; isDim(): number; isItalic(): number; isUnderline(): number; isBlink(): number; isInverse(): number; isStrikethrough(): number } | undefined;
  length: number;
}

/** Render a buffer line with ANSI escape sequences preserved. */
function renderLineWithColor(line: ColorBufferLine): string {
  // First pass: find the rightmost cell with non-default style or non-space content.
  // This lets us trim trailing default-styled whitespace without breaking styled spans.
  let lastStyledOrContent = -1;
  for (let x = 0; x < line.length; x++) {
    const cell = line.getCell(x);
    if (!cell) break;
    if (cell.getWidth() === 0) continue;
    const chars = cell.getChars();
    if (!isDefaultStyle(getCellStyle(cell)) || (chars !== "" && chars !== " ")) {
      lastStyledOrContent = x;
    }
  }

  if (lastStyledOrContent < 0) return ""; // entirely empty/default line

  let result = "";
  let currentStyle: CellStyle | null = null;

  for (let x = 0; x <= lastStyledOrContent; x++) {
    const cell = line.getCell(x);
    if (!cell) break;
    if (cell.getWidth() === 0) continue; // wide char continuation cell

    const chars = cell.getChars();
    const style = getCellStyle(cell);

    if (!currentStyle || !stylesEqual(currentStyle, style)) {
      // Style changed — always reset before switching
      if (currentStyle !== null && !isDefaultStyle(currentStyle)) {
        result += "\x1b[0m";
      }
      if (!isDefaultStyle(style)) {
        result += styleToAnsi(style);
      }
      currentStyle = style;
    }

    // Empty cells (width=1, no chars) are spaces — preserve them for background color
    result += chars || " ";
  }

  // Reset at end of line if we had styling
  if (currentStyle && !isDefaultStyle(currentStyle)) {
    result += "\x1b[0m";
  }

  return result;
}

// ---- Pure helper functions (exported for testing) ----

/** Extract title from a raw title string (or undefined). */
export function extractTitle(raw: string | undefined): string {
  return raw ?? "";
}

/** Extract fullscreen status from the xterm IBufferNamespace. */
export function extractIsFullscreen(bufferNamespace: { active: { type: string } }): boolean {
  return bufferNamespace.active.type === "alternate";
}

/** Check if any observable state has changed between two snapshots. */
export function hasChanged(
  before: { screen: string; title: string; is_fullscreen: boolean },
  current: { screen: string; title: string; is_fullscreen: boolean }
): boolean {
  return (
    current.screen !== before.screen ||
    current.title !== before.title ||
    current.is_fullscreen !== before.is_fullscreen
  );
}

/** Default interactive shell spawned by `ttc start`. */
export const DEFAULT_SHELL = "bash";

export class Session {
  readonly name: string;
  readonly command: string;
  readonly startTime: number;

  private ptyProcess: pty.IPty;
  private terminal: Terminal;
  private _status: "running" | "exited" = "running";
  private _exitCode: number | null = null;
  private lastSnapshot: string = "";
  private _title: string = "";
  private _isFullscreen: boolean;

  // Listeners notified on any PTY data or exit
  private changeListeners: Array<() => void> = [];

  constructor(
    name: string,
    options: { cwd?: string; cols?: number; rows?: number } = {}
  ) {
    this.name = name;
    this.command = DEFAULT_SHELL;
    this.startTime = Date.now();

    const cols = options.cols ?? 120;
    const rows = options.rows ?? 30;

    this.terminal = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 10000 });

    // Initialize fullscreen status immediately (onBufferChange only fires on changes)
    this._isFullscreen = extractIsFullscreen(this.terminal.buffer);

    this.terminal.onTitleChange((title: string) => {
      this._title = extractTitle(title);
      this.notifyListeners();
    });

    this.terminal.buffer.onBufferChange(() => {
      this._isFullscreen = extractIsFullscreen(this.terminal.buffer);
      this.notifyListeners();
    });

    this.ptyProcess = pty.spawn(DEFAULT_SHELL, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: options.cwd ?? process.cwd(),
      env: process.env as { [key: string]: string },
    });

    this.ptyProcess.onData((data: string) => {
      this.terminal.write(data);
      this.notifyListeners();
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this._status = "exited";
      this._exitCode = exitCode ?? null;
      this.notifyListeners();
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

  /** Send literal text to the PTY. Supports \n \r \t escape sequences. */
  send(input: string): void {
    if (this._status === "exited") {
      throw new Error(`Session ${this.name} has already exited`);
    }
    const interpreted = input
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
    this.ptyProcess.write(interpreted);
  }

  /** Write a key escape sequence to the PTY. */
  press(sequence: string): void {
    if (this._status === "exited") {
      throw new Error(`Session ${this.name} has already exited`);
    }
    this.ptyProcess.write(sequence);
  }

  /**
   * Return the current rendered screen as raw lines.
   * Trailing empty lines and per-line trailing spaces are removed.
   * Updates lastSnapshot for change detection.
   */
  snapshot(options?: { color?: boolean }): { lines: string[]; changed: boolean; title: string; is_fullscreen: boolean } {
    const buf = this.terminal.buffer.active;
    const useColor = options?.color ?? false;
    const plainLines: string[] = [];
    const startY = buf.viewportY;
    for (let i = 0; i < this.terminal.rows; i++) {
      plainLines.push((buf.getLine(startY + i)?.translateToString(true) ?? "").trimEnd());
    }
    // Remove trailing empty lines
    while (plainLines.length > 0 && plainLines[plainLines.length - 1] === "") {
      plainLines.pop();
    }
    // Remove leading empty lines (TUI apps like fzf render from bottom)
    while (plainLines.length > 0 && plainLines[0] === "") {
      plainLines.shift();
    }
    // Change detection always uses plain text
    const plainScreen = plainLines.join("\n");
    const changed = plainScreen !== this.lastSnapshot;
    this.lastSnapshot = plainScreen;

    // Build color lines if requested
    let lines: string[];
    if (useColor) {
      lines = [];
      for (let i = 0; i < this.terminal.rows; i++) {
        const bufLine = buf.getLine(startY + i);
        lines.push(bufLine ? renderLineWithColor(bufLine) : "");
      }
      // Trim trailing empty lines (match plain text trimming)
      while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
      }
      while (lines.length > 0 && lines[0] === "") {
        lines.shift();
      }
    } else {
      lines = plainLines;
    }
    return {
      lines,
      changed,
      title: this._title,
      is_fullscreen: this._isFullscreen,
    };
  }

  /**
   * Wait until the screen changes (or until pattern matches), then return snapshot.
   * If process exits, returns immediately.
   */
  async wait(
    timeoutMs: number = 3000,
    text?: string,
    debounceMs: number = 100,
    options?: { color?: boolean }
  ): Promise<{ lines: string[]; changed: boolean; title: string; is_fullscreen: boolean }> {
    const beforeScreen = this.lastSnapshot;
    const beforeTitle = this._title;
    const beforeFullscreen = this._isFullscreen;

    if (this._status === "exited") {
      return this.snapshot();
    }

    await new Promise<void>((resolve) => {
      let resolved = false;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      const done = () => {
        if (!resolved) {
          resolved = true;
          if (idleTimer) clearTimeout(idleTimer);
          clearTimeout(deadlineTimer);
          resolve();
        }
      };

      const deadlineTimer = setTimeout(done, timeoutMs);

      const check = () => {
        if (resolved) return;
        if (this._status === "exited") { done(); return; }

        // Get current rendered screen (don't update lastSnapshot yet)
        const buf = this.terminal.buffer.active;
        const lines: string[] = [];
        const startY = buf.viewportY;
        for (let i = 0; i < this.terminal.rows; i++) {
          lines.push((buf.getLine(startY + i)?.translateToString(true) ?? "").trimEnd());
        }
        while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
        while (lines.length > 0 && lines[0] === "") lines.shift();
        const currentScreen = lines.join("\n");

        if (text) {
          // Pattern mode: resolve when pattern appears in screen
          if (new RegExp(text).test(currentScreen)) { done(); return; }
        } else {
          // Change mode: resolve when any observable state differs from before AND has been idle
          if (hasChanged(
            { screen: beforeScreen, title: beforeTitle, is_fullscreen: beforeFullscreen },
            { screen: currentScreen, title: this._title, is_fullscreen: this._isFullscreen }
          )) {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(done, debounceMs);
          }
        }
      };

      this.changeListeners.push(check);
      check(); // check immediately in case already changed
    });

    return this.snapshot(options);
  }

  kill(): void {
    if (this._status === "running") {
      this.ptyProcess.kill();
    }
  }

  toInfo(): SessionInfo {
    return {
      session_name: this.name,
      command: this.command,
      status: this._status,
      exit_code: this._exitCode,
      start_time: this.startTime,
    };
  }

  /** Scroll viewport by lines. Negative = up, positive = down. */
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
      case "up": this.scrollUp(); break;
      case "down": this.scrollDown(); break;
      case "top": this.scrollTop(); break;
      case "bottom": this.scrollBottom(); break;
    }
  }

  private notifyListeners(): void {
    const listeners = [...this.changeListeners];
    this.changeListeners = [];
    for (const l of listeners) l();
  }
}
