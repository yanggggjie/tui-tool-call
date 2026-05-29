#!/usr/bin/env node
/**
 * ttc CLI
 */
import { Command } from "commander";
import { sendRequest, checkDaemonStatus, stopDaemon, restartDaemon } from "./client";
import { validateSessionName } from "./sessionName";
import { Response, ErrorResponse, ScreenResponse } from "./protocol";
import { version } from "../package.json";

const program = new Command();

program
  .name("ttc")
  .description("TUI automation for AI agents — like BrowserUse, but for the terminal")
  .version(version);

// ---- session ----
program
  .command("start <session-name> [args...]")
  .description("Start a named PTY session (name: lowercase letters and hyphens, e.g. temp-work)")
  .option("--cwd <dir>", "Working directory for the command")
  .option("--cols <n>", "Terminal width (default: 120)", "120")
  .option("--rows <n>", "Terminal height (default: 30)", "30")
  .action(async (sessionName: string, args: string[], opts) => {
    const nameErr = validateSessionName(sessionName);
    if (nameErr) {
      process.stderr.write(`Error: ${nameErr}\n`);
      process.exit(1);
    }
    const command = args.join(" ");
    if (!command.trim()) {
      process.stderr.write("Error: no command specified\n");
      process.exit(1);
    }
    const res = await sendRequest({
      type: "start",
      session_name: sessionName,
      command,
      cwd: opts.cwd,
      cols: parseInt(opts.cols, 10),
      rows: parseInt(opts.rows, 10),
    });
    handleResponse(res, (r) => {
      if (r.type === "start") console.log(r.session_id);
    });
  });

program
  .command("use <session-name>")
  .description("Set the current session for subsequent commands")
  .action(async (sessionName: string) => {
    const nameErr = validateSessionName(sessionName);
    if (nameErr) {
      process.stderr.write(`Error: ${nameErr}\n`);
      process.exit(1);
    }
    const res = await sendRequest({ type: "use", session_id: sessionName });
    handleResponse(res, (r) => {
      if (r.type === "use") console.log(JSON.stringify({ ok: r.ok, session_id: r.session_id }));
    });
  });

program
  .command("kill")
  .description("Terminate the current session")
  .action(async () => {
    const res = await sendRequest({ type: "kill" });
    handleResponse(res, (r) => {
      if (r.type === "kill") console.log(JSON.stringify({ ok: r.ok }));
    });
  });

program
  .command("list")
  .description("List all active sessions")
  .action(async () => {
    const res = await sendRequest({ type: "list" });
    handleResponse(res, (r) => {
      if (r.type !== "list") return;
      if (r.sessions.length === 0) {
        console.log("No active sessions");
        return;
      }
      const idWidth = Math.max(10, ...r.sessions.map((s) => s.session_id.length));
      const labelWidth = Math.max(5, ...r.sessions.map((s) => s.label.length));
      const cmdWidth = Math.max(7, ...r.sessions.map((s) => s.command.length));
      const header = `${"SESSION ID".padEnd(idWidth)}  ${"LABEL".padEnd(labelWidth)}  ${"COMMAND".padEnd(cmdWidth)}  STATUS`;
      console.log(header);
      console.log("-".repeat(header.length));
      for (const s of r.sessions) {
        const mark = s.session_id === r.current ? " [current]" : "";
        console.log(
          `${s.session_id.padEnd(idWidth)}  ${s.label.padEnd(labelWidth)}  ${s.command.padEnd(cmdWidth)}  ${s.status}${mark}`
        );
      }
    });
  });

program
  .command("info")
  .description("Show detailed information about the current session")
  .action(async () => {
    const res = await sendRequest({ type: "info" });
    handleResponse(res, (r) => {
      if (r.type === "info") {
        console.log(`Session ID: ${r.session_id}`);
        console.log(`Label: ${r.label}`);
        console.log(`Command: ${r.command}`);
        console.log(`Status: ${r.status}`);
        if (r.exit_code !== null) console.log(`Exit Code: ${r.exit_code}`);
        console.log(`Size: ${r.cols}x${r.rows}`);
        console.log(`Started: ${new Date(r.start_time).toISOString()}`);
      }
    });
  });

program
  .command("rename <label>")
  .description("Rename the current session with a new label")
  .action(async (label: string) => {
    const res = await sendRequest({ type: "rename", label });
    handleResponse(res, (r) => {
      if (r.type === "rename") console.log(JSON.stringify({ ok: r.ok, label: r.label }));
    });
  });

// ---- observe (plain text screen only) ----
program
  .command("now")
  .description("Print the current screen")
  .action(async () => {
    const res = await sendRequest({ type: "screen", done: false });
    handleResponse(res, (r) => printScreen(r as ScreenResponse));
  });

program
  .command("done")
  .description("Wait until the screen is stable, then print it")
  .action(async () => {
    const res = await sendRequest({ type: "screen", done: true });
    handleResponse(res, (r) => printScreen(r as ScreenResponse));
  });

program
  .command("watch")
  .description("Refresh screen every second in-place (Ctrl+C to stop)")
  .action(async () => {
    await runWatch();
  });

program
  .command("up")
  .alias("u")
  .description("Scroll up one screen, then print screen")
  .action(scrollCmd("up"));

program
  .command("down")
  .alias("d")
  .description("Scroll down one screen, then print screen")
  .action(scrollCmd("down"));

program
  .command("top")
  .alias("t")
  .description("Scroll to top of buffer, then print screen")
  .action(scrollCmd("top"));

program
  .command("bottom")
  .alias("b")
  .description("Scroll to bottom of buffer, then print screen")
  .action(scrollCmd("bottom"));

// ---- input ----
program
  .command("type <input...>")
  .description("Type text to the current session (\\n = Enter, \\t = Tab), then print screen when stable")
  .action(async (inputParts: string[]) => {
    const res = await sendRequest({ type: "type", input: inputParts.join(" ") });
    handleResponse(res, (r) => printScreen(r as ScreenResponse));
  });

program
  .command("press <key>")
  .description("Press a key (enter, escape, ctrl+c, arrow_up, …), then print screen when stable")
  .action(async (key: string) => {
    const res = await sendRequest({ type: "press", key });
    handleResponse(res, (r) => printScreen(r as ScreenResponse));
  });

// ---- daemon ----
const daemonCmd = program.command("daemon").description("Manage the ttc daemon");

daemonCmd.command("status").action(() => {
  const status = checkDaemonStatus();
  console.log(JSON.stringify(status.running ? { status: "running", pid: status.pid } : { status: "stopped" }, null, 2));
});

daemonCmd.command("stop").action(() => {
  const stopped = stopDaemon();
  console.log(JSON.stringify({ ok: stopped }, null, 2));
});

daemonCmd.command("restart").action(async () => {
  await restartDaemon();
  const status = checkDaemonStatus();
  console.log(JSON.stringify({ ok: true, pid: status.pid }, null, 2));
});

function scrollCmd(direction: "up" | "down" | "top" | "bottom") {
  return async () => {
    const res = await sendRequest({ type: "scroll", direction });
    handleResponse(res, (r) => printScreen(r as ScreenResponse));
  };
}

const WATCH_INTERVAL_MS = 1000;
const CLEAR_HOME = "\x1b[2J\x1b[H";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

function printScreen(r: ScreenResponse): void {
  if (r.lines.length === 0) return;
  process.stdout.write(r.lines.join("\n") + "\n");
}

function writeScreenInPlace(lines: string[]): void {
  process.stdout.write(CLEAR_HOME);
  if (lines.length === 0) return;
  process.stdout.write(lines.join("\n") + "\n");
}

async function runWatch(): Promise<void> {
  process.stderr.write("Watching (1s)… Ctrl+C to stop\n");
  process.stdout.write(HIDE_CURSOR);

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(SHOW_CURSOR);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    const res = await sendRequest({ type: "screen", done: false });
    if (res.type === "error") {
      process.stdout.write(SHOW_CURSOR);
      process.stderr.write(`Error: ${(res as ErrorResponse).message}\n`);
      process.exit(1);
    }
    writeScreenInPlace((res as ScreenResponse).lines);
    await sleep(WATCH_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function handleResponse(res: Response, onSuccess: (r: Response) => void): void {
  if (res.type === "error") {
    process.stderr.write(`Error: ${(res as ErrorResponse).message}\n`);
    process.exit(1);
  }
  onSuccess(res);
}

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
