/**
 * CLI → daemon HTTP client. Auto-starts the daemon if needed.
 */
import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import { DAEMON_URL, PID_PATH } from "./daemon";
import { Request, Response } from "./protocol";

const DAEMON_START_TIMEOUT_MS = 3000;
const DAEMON_POLL_INTERVAL_MS = 100;

function info(msg: string): void {
  process.stderr.write(`ttc: ${msg}\n`);
}

export async function ensureDaemonRunning(): Promise<void> {
  if (!(await isDaemonReachable())) {
    info("starting daemon...");
    await startDaemon();
  }
}

export async function sendRequest(req: Request): Promise<Response> {
  await ensureDaemonRunning();
  const res = await fetch(`${DAEMON_URL}/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`Daemon HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<Response>;
}

async function isDaemonReachable(): Promise<boolean> {
  if (!isDaemonPidAlive()) return false;
  try {
    const res = await fetch(`${DAEMON_URL}/health`, { signal: AbortSignal.timeout(500) });
    return res.ok;
  } catch {
    return false;
  }
}

function isDaemonPidAlive(): boolean {
  if (!fs.existsSync(PID_PATH)) return false;
  try {
    const pid = parseInt(fs.readFileSync(PID_PATH, "utf-8").trim(), 10);
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function startDaemon(): Promise<void> {
  const daemonScript = path.join(__dirname, "daemon.js");
  if (!fs.existsSync(daemonScript)) {
    throw new Error(`Daemon script not found: ${daemonScript}`);
  }

  const child = child_process.spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: ["ignore", "ignore", "inherit"],
  });
  child.on("error", (e) => info(`failed to spawn daemon: ${e.message}`));
  child.unref();

  const deadline = Date.now() + DAEMON_START_TIMEOUT_MS;
  let attempts = 0;
  while (Date.now() < deadline) {
    await sleep(DAEMON_POLL_INTERVAL_MS);
    attempts++;
    if (await isDaemonReachable()) {
      info(`daemon ready (${attempts * DAEMON_POLL_INTERVAL_MS}ms)`);
      return;
    }
  }

  throw new Error(
    `Daemon failed to start after ${DAEMON_START_TIMEOUT_MS}ms\n` +
      `  Check if port 7654 is in use or see stderr for errors`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
