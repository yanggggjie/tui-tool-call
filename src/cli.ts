#!/usr/bin/env node
/**
 * ttc CLI
 */
import * as path from "path";
import { Command } from "commander";
import { ensureServerRunning, sendRequest } from "./client";
import { SERVER_URL } from "./server";
import { validateSessionName } from "./session";
import { SUPPORTED_KEYS } from "./keys";
import { Response, ErrorResponse, ScreenResponse } from "./protocol";
import { version } from "../package.json";

const program = new Command();

program
  .name("ttc")
  .description("TUI automation for AI agents — like BrowserUse, but for the terminal")
  .version(version);

function exitOnBadSessionName(name: string): void {
  const err = validateSessionName(name);
  if (err) {
    process.stderr.write(`Error: ${err}\n`);
    process.exit(1);
  }
}

program
  .command("start <session-name> <command...>")
  .description("Start a program in a PTY, then print screen when stable")
  .option("-C, --cwd <path>", "Working directory (default: current directory)")
  .action(async (sessionName: string, command: string[], options: { cwd?: string }) => {
    exitOnBadSessionName(sessionName);
    if (command.length === 0) {
      process.stderr.write(
        "Error: command required. Example: ttc start dev npm run dev\n"
      );
      process.exit(1);
    }
    const res = await sendRequest({
      type: "start",
      session_name: sessionName,
      command,
      cwd: path.resolve(options.cwd ?? process.cwd()),
    });
    handleResponse(res, (r) => printScreen(r as ScreenResponse));
  });

program
  .command("kill <session-name>")
  .description("Terminate a session")
  .action(async (sessionName: string) => {
    exitOnBadSessionName(sessionName);
    const res = await sendRequest({ type: "kill", session_name: sessionName });
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
      for (const s of r.sessions) {
        console.log(s.session_name);
      }
    });
  });

program
  .command("now <session-name>")
  .description("Print the current screen")
  .action(async (sessionName: string) => {
    exitOnBadSessionName(sessionName);
    const res = await sendRequest({ type: "now", session_name: sessionName });
    handleResponse(res, (r) => printScreen(r as ScreenResponse));
  });

program
  .command("done <session-name>")
  .description("Wait until the screen is stable, then print it")
  .action(async (sessionName: string) => {
    exitOnBadSessionName(sessionName);
    const res = await sendRequest({ type: "done", session_name: sessionName });
    handleResponse(res, (r) => printScreen(r as ScreenResponse));
  });

program
  .command("watch")
  .description("Human-only: start local web UI to observe all sessions (read-only)")
  .action(async () => {
    await runWatchServer();
  });

program
  .command("up <session-name>")
  .alias("u")
  .description("Scroll up one screen, then print screen")
  .action(scrollCmd("up"));

program
  .command("down <session-name>")
  .alias("d")
  .description("Scroll down one screen, then print screen")
  .action(scrollCmd("down"));

program
  .command("top <session-name>")
  .alias("t")
  .description("Scroll to top of buffer, then print screen")
  .action(scrollCmd("top"));

program
  .command("bottom <session-name>")
  .alias("b")
  .description("Scroll to bottom of buffer, then print screen")
  .action(scrollCmd("bottom"));

program
  .command("type <session-name> <input...>")
  .description("Type text (\\n = Enter, \\t = Tab), then print screen when stable")
  .action(async (sessionName: string, inputParts: string[]) => {
    exitOnBadSessionName(sessionName);
    const res = await sendRequest({
      type: "text",
      session_name: sessionName,
      text: inputParts.join(" "),
    });
    handleResponse(res, (r) => printScreen(r as ScreenResponse));
  });

program
  .command("press <session-name> <key>")
  .description("Press a key (enter, escape, ctrl+c, arrow_up, …), then print screen when stable")
  .action(async (sessionName: string, key: string) => {
    exitOnBadSessionName(sessionName);
    const res = await sendRequest({ type: "press", session_name: sessionName, key });
    handleResponse(res, (r) => printScreen(r as ScreenResponse));
  });

program
  .command("keys")
  .description("List all key names supported by `ttc press`")
  .action(() => {
    console.log(SUPPORTED_KEYS.join(", "));
  });

function scrollCmd(direction: "up" | "down" | "top" | "bottom") {
  return async (sessionName: string) => {
    exitOnBadSessionName(sessionName);
    const res = await sendRequest({ type: "scroll", session_name: sessionName, direction });
    handleResponse(res, (r) => printScreen(r as ScreenResponse));
  };
}

function printScreen(r: ScreenResponse): void {
  if (!r.screen) return;
  process.stdout.write(r.screen + "\n");
}

function handleResponse(res: Response, onSuccess: (r: Response) => void): void {
  if (res.type === "error") {
    process.stderr.write(`Error: ${(res as ErrorResponse).message}\n`);
    process.exit(1);
  }
  onSuccess(res);
}

async function runWatchServer(): Promise<void> {
  if (!process.stdout.isTTY) {
    process.stderr.write(
      "Error: ttc watch is for human observation only. Agents must not run this command.\n"
    );
    process.exit(1);
  }

  await ensureServerRunning();

  const res = await sendRequest({ type: "list" });
  if (res.type === "error") {
    process.stderr.write(`Error: ${res.message}\n`);
    process.exit(1);
  }

  process.stderr.write("ttc watch — read-only session observer (Ctrl+C to exit)\n");
  console.log(SERVER_URL);

  await new Promise<void>((resolve) => {
    const stop = () => resolve();
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
