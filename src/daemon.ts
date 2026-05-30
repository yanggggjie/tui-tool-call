/**
 * ttc daemon entry point.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { armIdleTimer, killAllSessions } from "./rpc";
import { startHttpServer } from "./http-server";

export const TERMLINK_DIR = path.join(os.homedir(), ".ttc");
export const PID_PATH = path.join(TERMLINK_DIR, "daemon.pid");
export const DAEMON_HOST = "127.0.0.1";
export const DAEMON_PORT = 7654;
export const DAEMON_URL = `http://${DAEMON_HOST}:${DAEMON_PORT}`;

function startDaemon(): void {
  fs.mkdirSync(TERMLINK_DIR, { recursive: true });

  const server = startHttpServer();
  server.listen(DAEMON_PORT, DAEMON_HOST, () => {
    fs.writeFileSync(PID_PATH, String(process.pid));
    process.stderr.write(`ttc daemon started (pid=${process.pid}, ${DAEMON_URL})\n`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    let message = `daemon error: ${err.message}`;
    if (err.code === "EADDRINUSE") {
      message += `\n  Port ${DAEMON_PORT} is already in use.`;
    } else if (err.code === "EACCES") {
      message += `\n  Permission denied on port ${DAEMON_PORT}.`;
    }
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });

  function shutdown(): void {
    killAllSessions();
    process.exit(0);
  }

  process.on("exit", () => {
    try {
      fs.unlinkSync(PID_PATH);
    } catch {
      /* ignore */
    }
  });

  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, shutdown);
  }

  process.on("uncaughtException", (err) => {
    process.stderr.write(`[daemon] uncaught exception: ${err.message}\n`);
    shutdown();
  });

  armIdleTimer();
}

if (require.main === module) {
  startDaemon();
}
