#!/usr/bin/env node
/**
 * ttc CLI — act (mutate PTY) and obs (read screen) are separate APIs.
 * Options use short names and --name=value syntax.
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
const SCROLL_DIRECTIONS = ["up", "down", "top", "bottom"] as const;
type ScrollDirection = (typeof SCROLL_DIRECTIONS)[number];

const START_EXAMPLE = 'ttc act start --sess=dev --cmd="npm run dev"';

program
  .name("ttc")
  .description("TUI automation for AI agents — like BrowserUse, but for the terminal")
  .version(version);

/** Split a command string into argv (whitespace, respecting quotes). */
function parseCommandArgv(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) {
        quote = null;
        continue;
      }
      current += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (/\s/.test(c)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += c;
  }

  if (current) args.push(current);
  return args;
}

function requireSession(sess: string): string {
  exitOnBadSessionName(sess);
  return sess;
}

function exitOnBadSessionName(name: string): void {
  const err = validateSessionName(name);
  if (err) {
    process.stderr.write(`Error: ${err}\n`);
    process.exit(1);
  }
}

function requireCommandArgv(cmd: string): string[] {
  const argv = parseCommandArgv(cmd.trim());
  if (argv.length === 0) {
    process.stderr.write(`Error: --cmd= must not be empty. Example: ${START_EXAMPLE}\n`);
    process.exit(1);
  }
  return argv;
}

function requireScrollDirection(dir: string): ScrollDirection {
  if ((SCROLL_DIRECTIONS as readonly string[]).includes(dir)) {
    return dir as ScrollDirection;
  }
  process.stderr.write(`Error: --dire= must be one of: ${SCROLL_DIRECTIONS.join(", ")}\n`);
  process.exit(1);
}

function handleAct(res: Response, onSuccess?: (r: Response) => void): void {
  if (res.type === "error") {
    process.stderr.write(`Error: ${(res as ErrorResponse).message}\n`);
    process.exit(1);
  }
  onSuccess?.(res);
}

function handleObs(res: Response): void {
  if (res.type === "error") {
    process.stderr.write(`Error: ${(res as ErrorResponse).message}\n`);
    process.exit(1);
  }
  if (res.type !== "screen") {
    process.stderr.write("Error: expected screen response\n");
    process.exit(1);
  }
  const screen = (res as ScreenResponse).screen;
  if (screen) process.stdout.write(screen + "\n");
}

const act = program
  .command("act")
  .description("Action API — mutate PTY state; success is silent (exit 0), no screen output");

act
  .command("start")
  .description("Start a program in a PTY")
  .requiredOption("--sess <name>", "Session name (--sess=dev)")
  .requiredOption("--cmd <command>", 'Command line (--cmd="npm run dev")')
  .option("--cwd <path>", "Working directory (default: current directory; --cwd=./path)")
  .action(async (options: { sess: string; cmd: string; cwd?: string }) => {
    const res = await sendRequest({
      type: "start",
      session_name: requireSession(options.sess),
      command: requireCommandArgv(options.cmd),
      cwd: path.resolve(options.cwd ?? process.cwd()),
    });
    handleAct(res);
  });

act
  .command("type")
  .description("Type text (\\n = Enter, \\t = Tab)")
  .requiredOption("--sess <name>", "Session name (--sess=dev)")
  .requiredOption("--txt <text>", "Text to type (--txt=hello)")
  .action(async (options: { sess: string; txt: string }) => {
    const res = await sendRequest({
      type: "text",
      session_name: requireSession(options.sess),
      text: options.txt,
    });
    handleAct(res);
  });

act
  .command("press")
  .description("Press a key (enter, escape, ctrl+c, arrow_up, …)")
  .requiredOption("--sess <name>", "Session name (--sess=dev)")
  .requiredOption("--key <key>", "Key name (--key=enter)")
  .action(async (options: { sess: string; key: string }) => {
    const res = await sendRequest({
      type: "press",
      session_name: requireSession(options.sess),
      key: options.key,
    });
    handleAct(res);
  });

act
  .command("kill")
  .description("Terminate a session")
  .requiredOption("--sess <name>", "Session name (--sess=dev)")
  .action(async (options: { sess: string }) => {
    const res = await sendRequest({
      type: "kill",
      session_name: requireSession(options.sess),
    });
    handleAct(res);
  });

act
  .command("killall")
  .description("Terminate all sessions")
  .action(async () => {
    const res = await sendRequest({ type: "killall" });
    handleAct(res);
  });

act
  .command("list")
  .description("List all active sessions")
  .action(async () => {
    const res = await sendRequest({ type: "list" });
    handleAct(res, (r) => {
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

const obs = program
  .command("obs")
  .description("Observation API — read terminal screen to stdout");

obs
  .command("now")
  .description("Print the current screen immediately")
  .requiredOption("--sess <name>", "Session name (--sess=dev)")
  .action(async (options: { sess: string }) => {
    const res = await sendRequest({
      type: "now",
      session_name: requireSession(options.sess),
    });
    handleObs(res);
  });

obs
  .command("done")
  .description("Wait until the screen is stable, then print it")
  .requiredOption("--sess <name>", "Session name (--sess=dev)")
  .action(async (options: { sess: string }) => {
    const res = await sendRequest({
      type: "done",
      session_name: requireSession(options.sess),
    });
    handleObs(res);
  });

obs
  .command("scroll")
  .description("Scroll viewport, then print screen")
  .requiredOption("--sess <name>", "Session name (--sess=dev)")
  .requiredOption("--dire <direction>", "Scroll direction: up, down, top, bottom (--dire=up)")
  .action(async (options: { sess: string; dire: string }) => {
    const res = await sendRequest({
      type: "scroll",
      session_name: requireSession(options.sess),
      direction: requireScrollDirection(options.dire),
    });
    handleObs(res);
  });

program
  .command("watch")
  .description("Human-only: start local web UI to observe all sessions (read-only)")
  .action(async () => {
    await runWatchServer();
  });

program
  .command("keys")
  .description("List all key names supported by `ttc act press`")
  .action(() => {
    console.log(SUPPORTED_KEYS.join(", "));
  });

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
