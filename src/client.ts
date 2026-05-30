/**
 * ttc/src/client.ts
 *
 * CLI → daemon IPC client.
 * Auto-starts the daemon if it's not running.
 */
import * as net from "net";
import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import { SOCKET_PATH, PID_PATH, DAEMON_PORT } from "./daemon";
import { Request, Response } from "./protocol";

const DAEMON_START_TIMEOUT_MS = 3000;
const DAEMON_POLL_INTERVAL_MS = 100;

function createConnection(): net.Socket {
  if (process.platform === "win32") {
    return net.createConnection(DAEMON_PORT);
  }
  return net.createConnection(SOCKET_PATH);
}

function info(msg: string): void {
  process.stderr.write(`ttc: ${msg}\n`);
}

/** Ensure daemon is running (used by watch server). */
export async function ensureDaemonRunning(): Promise<void> {
  if (!isDaemonRunning()) {
    info("starting daemon...");
    await startDaemon();
  }
}

/** Send one request to daemon, return response. Auto-starts daemon if needed. */
export async function sendRequest(req: Request): Promise<Response> {
  await ensureDaemonRunning();
  return sendToDaemon(req);
}

function isDaemonRunning(): boolean {
  if (process.platform !== "win32" && !fs.existsSync(SOCKET_PATH)) return false;
  if (!fs.existsSync(PID_PATH)) return false;
  try {
    const pid = parseInt(fs.readFileSync(PID_PATH, "utf-8").trim(), 10);
    process.kill(pid, 0); // throws if process doesn't exist
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
    stdio: ["ignore", "ignore", "inherit"],  // show daemon stderr (crash logs etc)
  });
  child.on("error", (e) => info(`failed to spawn daemon: ${e.message}`));
  child.unref();

  const deadline = Date.now() + DAEMON_START_TIMEOUT_MS;
  let attempts = 0;
  while (Date.now() < deadline) {
    await sleep(DAEMON_POLL_INTERVAL_MS);
    attempts++;
    if (await canConnect()) {
      info(`daemon ready (${attempts * DAEMON_POLL_INTERVAL_MS}ms)`);
      return;
    }
  }

  let msg = `Daemon failed to start after ${DAEMON_START_TIMEOUT_MS}ms`;
  if (process.platform === "win32") {
    msg += `\n  Check if port ${DAEMON_PORT} is in use: netstat -ano | findstr :${DAEMON_PORT}`;
  } else {
    msg += `\n  Check stderr for errors`;
  }
  throw new Error(msg);
}

function canConnect(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection();
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => resolve(false));
  });
}

function sendToDaemon(req: Request): Promise<Response> {
  return new Promise((resolve, reject) => {
    const socket = createConnection();
    let buffer = "";
    let responded = false;
    let cleaned = false;

    function cleanup() {
      if (!cleaned) {
        cleaned = true;
        socket.destroy();
      }
    }

    socket.on("connect", () => {
      socket.write(JSON.stringify(req) + "\n");
    });

    socket.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        if (!responded) {
          responded = true;
          try {
            resolve(JSON.parse(line) as Response);
          } catch (e) {
            reject(new Error(`Invalid response JSON: ${line}`));
          }
          cleanup();
        }
      }
    });

    socket.on("error", (e: NodeJS.ErrnoException) => {
      let message = `socket error: ${e.message}`;

      // Windows-specific error guidance
      if (process.platform === "win32") {
        if (e.code === "ECONNREFUSED") {
          message += `\n  Could not connect on port ${DAEMON_PORT}`;
        } else if (e.code === "EACCES") {
          message += `\n  Permission denied connecting to daemon. Try running with elevated privileges.`;
        }
      } else {
        if (e.code === "ECONNREFUSED") {
          message += `\n  Could not connect to socket at ${SOCKET_PATH}`;
        }
      }

      info(message);
      cleanup();
      reject(e);
    });
    socket.on("close", () => {
      if (!responded) {
        reject(new Error("Connection closed before response"));
      }
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
