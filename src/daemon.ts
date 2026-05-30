/**
 * ttc/src/daemon.ts
 *
 * Background daemon process. Manages PTY sessions, listens on Unix socket.
 * Auto-exits when all sessions have been dead for IDLE_TIMEOUT_MS.
 *
 * Run directly: node dist/daemon.js
 * Usually auto-started by client.ts when needed.
 */
import * as net from "net";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Session, validateSessionName } from "./session";
import {
  Request,
  Response,
  StartRequest,
  ScreenRequest,
  TypeRequest,
  PressRequest,
  KillRequest,
  ScrollRequest,
  ScreenResponse,
} from "./protocol";

const WAIT_MS = 3000;
const DEBOUNCE_MS = 100;

const TERMLINK_DIR = path.join(os.homedir(), ".ttc");
export const SOCKET_PATH = path.join(TERMLINK_DIR, "daemon.sock");
export const PID_PATH = path.join(TERMLINK_DIR, "daemon.pid");
export const DAEMON_PORT = 7654;

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Platform-aware server listening configuration
function startServerListener(server: net.Server, callback: () => void): void {
  if (process.platform === "win32") {
    server.listen(DAEMON_PORT, callback);
  } else {
    server.listen(SOCKET_PATH, callback);
  }
}

// ---- Session registry ----

const sessions = new Map<string, Session>();
/** Names currently in `start` handler (before session is registered). */
const startingSessions = new Set<string>();
let idleTimer: NodeJS.Timeout | null = null;

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const allDead = [...sessions.values()].every(
      (s) => s.status === "exited"
    );
    if (allDead) {
      process.exit(0);
    }
  }, IDLE_TIMEOUT_MS);
  idleTimer.unref(); // don't prevent process exit if nothing else is running
}

function getSession(name: string): Session | Response {
  const nameErr = validateSessionName(name);
  if (nameErr) return { type: "error", message: nameErr };
  const session = sessions.get(name);
  if (!session) {
    return { type: "error", message: `Session not found: ${name}` };
  }
  return session;
}

const SESSION_IN_USE_HINT = (name: string) =>
  `Session "${name}" is already in use. Use a different session name, or run 'ttc kill ${name}' first.`;

/** Returns an error response if the name is in use; otherwise removes stale exited sessions. */
function checkSessionNameAvailable(name: string): Response | null {
  if (startingSessions.has(name)) {
    return {
      type: "error",
      message: SESSION_IN_USE_HINT(name),
    };
  }

  const existing = sessions.get(name);
  if (!existing) return null;

  if (existing.status === "running") {
    return {
      type: "error",
      message: SESSION_IN_USE_HINT(name),
    };
  }

  sessions.delete(name);
  return null;
}

function screenResponse(
  session: Session,
  sessionName: string,
  responseType: ScreenResponse["type"],
  snap: ReturnType<Session["snapshot"]>
): ScreenResponse {
  return {
    type: responseType,
    session_name: sessionName,
    lines: snap.lines,
    changed: snap.changed,
    status: session.status,
    exit_code: session.exitCode,
    title: snap.title,
    is_fullscreen: snap.is_fullscreen,
    cols: session.cols,
    rows: session.rows,
  };
}

async function doneSnapshot(session: Session): Promise<ReturnType<Session["snapshot"]>> {
  await session.wait(WAIT_MS, undefined, DEBOUNCE_MS);
  return session.snapshot();
}

// ---- Request handlers ----

async function handleRequest(req: Request): Promise<Response> {
  switch (req.type) {
    case "start": {
      const r = req as StartRequest;
      const nameErr = validateSessionName(r.session_name);
      if (nameErr) return { type: "error", message: nameErr };

      const unavailable = checkSessionNameAvailable(r.session_name);
      if (unavailable) return unavailable;

      startingSessions.add(r.session_name);
      try {
        const session = new Session(r.session_name);
        sessions.set(r.session_name, session);
        resetIdleTimer();
        const snap = await doneSnapshot(session);
        return screenResponse(session, r.session_name, "start", snap);
      } finally {
        startingSessions.delete(r.session_name);
      }
    }

    case "screen": {
      const r = req as ScreenRequest;
      const sessionOrError = getSession(r.session_name);
      if ("type" in sessionOrError && sessionOrError.type === "error") return sessionOrError;
      const session = sessionOrError as Session;
      const snap = r.done ? await doneSnapshot(session) : session.snapshot();
      return screenResponse(session, r.session_name, "screen", snap);
    }

    case "type": {
      const r = req as TypeRequest;
      const sessionOrError = getSession(r.session_name);
      if ("type" in sessionOrError && sessionOrError.type === "error") return sessionOrError;
      const session = sessionOrError as Session;
      try {
        session.send(r.input);
        const snap = await doneSnapshot(session);
        return screenResponse(session, r.session_name, "type", snap);
      } catch (e: unknown) {
        return {
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        };
      }
    }

    case "press": {
      const r = req as PressRequest;
      const sessionOrError = getSession(r.session_name);
      if ("type" in sessionOrError && sessionOrError.type === "error") return sessionOrError;
      const session = sessionOrError as Session;
      try {
        session.press(r.sequence);
        const snap = await doneSnapshot(session);
        return screenResponse(session, r.session_name, "press", snap);
      } catch (e: unknown) {
        return {
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        };
      }
    }

    case "kill": {
      const r = req as KillRequest;
      const sessionOrError = getSession(r.session_name);
      if ("type" in sessionOrError && sessionOrError.type === "error") return sessionOrError;
      const session = sessionOrError as Session;
      session.kill();
      sessions.delete(r.session_name);
      resetIdleTimer();
      return { type: "kill", ok: true };
    }

    case "list": {
      const list = [...sessions.values()].map((s) => s.toInfo());
      return { type: "list", sessions: list };
    }

    case "scroll": {
      const r = req as ScrollRequest;
      const sessionOrError = getSession(r.session_name);
      if ("type" in sessionOrError && sessionOrError.type === "error") return sessionOrError;
      const session = sessionOrError as Session;
      session.scroll(r.direction);
      return screenResponse(session, r.session_name, "scroll", session.snapshot());
    }

    default: {
      return { type: "error", message: "Unknown request type" };
    }
  }
}

// ---- Socket server ----

function startServer() {
  fs.mkdirSync(TERMLINK_DIR, { recursive: true });

  // Clean up stale socket (Unix only)
  if (process.platform !== "win32" && fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }

  const server = net.createServer((socket) => {
    let buffer = "";

    socket.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        let req: Request;
        try {
          req = JSON.parse(line) as Request;
        } catch {
          socket.write(
            JSON.stringify({ type: "error", message: "Invalid JSON" }) + "\n"
          );
          continue;
        }

        handleRequest(req).then((res) => {
          try {
            socket.write(JSON.stringify(res) + "\n");
          } catch (writeErr) {
            const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
            process.stderr.write(`[daemon] failed to write response: ${msg}\n`);
          }
        }).catch((err) => {
          const errMsg = err instanceof Error ? err.stack ?? err.message : String(err);
          process.stderr.write(`[daemon] handleRequest error: ${errMsg}\n`);
          try {
            socket.write(JSON.stringify({ type: "error", message: String(err instanceof Error ? err.message : err) }) + "\n");
          } catch (writeErr) {
            const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
            process.stderr.write(`[daemon] failed to write error response: ${msg}\n`);
          }
        });
      }
    });

    socket.on("error", (err) => {
      // Log errors but don't crash - client may have disconnected abruptly
      if ((err as NodeJS.ErrnoException).code !== "ECONNRESET") {
        process.stderr.write(`[daemon] socket error: ${err.message}\n`);
      }
    });
  });

  startServerListener(server, () => {
    fs.writeFileSync(PID_PATH, String(process.pid));
    const listenTarget = process.platform === "win32" ? `port ${DAEMON_PORT}` : SOCKET_PATH;
    process.stderr.write(`ttc daemon started (pid=${process.pid}, listening on ${listenTarget})\n`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    let message = `daemon error: ${err.message}`;

    // Windows-specific error guidance
    if (process.platform === "win32" && err.code === "EADDRINUSE") {
      message += `\n  Port ${DAEMON_PORT} is already in use.`;
    } else if (process.platform === "win32" && err.code === "EACCES") {
      message += `\n  Permission denied on port ${DAEMON_PORT}. Try running with elevated privileges.`;
    }

    process.stderr.write(`${message}\n`);
    process.exit(1);
  });

  // Graceful shutdown: kill all sessions and clean up
  function gracefulShutdown() {
    for (const session of sessions.values()) {
      try {
        session.kill();
      } catch {
        /* session may already be dead */
      }
    }
    process.exit(0);
  }

  // Cleanup on exit
  process.on("exit", () => {
    try {
      if (process.platform !== "win32") fs.unlinkSync(SOCKET_PATH);
      fs.unlinkSync(PID_PATH);
    } catch {
      /* ignore */
    }
  });

  // Signal handling (Windows: SIGTERM/SIGINT may not fire, but process can be terminated)
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, gracefulShutdown);
  }

  // Windows: handle uncaught exceptions gracefully
  process.on("uncaughtException", (err) => {
    process.stderr.write(`[daemon] uncaught exception: ${err.message}\n`);
    gracefulShutdown();
  });

  resetIdleTimer();
}

// ---- Entry point (when run directly) ----
if (require.main === module) {
  startServer();
}
