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
  UseRequest,
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
let idleTimer: NodeJS.Timeout | null = null;
let currentSession: string | null = null;

function setCurrentSession(id: string | null): void {
  currentSession = id;
}

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

function getCurrentSession(): Session | Response {
  if (!currentSession) {
    return { type: "error", message: "No current session. Run 'ttc use <session-name>' first." };
  }
  const session = sessions.get(currentSession);
  if (!session) {
    return { type: "error", message: `Session not found: ${currentSession}` };
  }
  return session;
}

function screenResponse(
  session: Session,
  sessionId: string,
  responseType: ScreenResponse["type"],
  snap: ReturnType<Session["snapshot"]>
): ScreenResponse {
  return {
    type: responseType,
    session_id: sessionId,
    lines: snap.lines,
    changed: snap.changed,
    status: session.status,
    exit_code: session.exitCode,
    title: snap.title,
    is_fullscreen: snap.is_fullscreen,
    cols: session.cols,
    rows: session.rows,
    highlights: snap.highlights,
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
      if (sessions.has(r.session_name)) {
        return {
          type: "error",
          message: `Session "${r.session_name}" already exists. Use 'ttc use ${r.session_name}' or 'ttc kill' first.`,
        };
      }
      const session = new Session(r.session_name, r.command, {
        cwd: r.cwd,
        label: r.session_name,
        cols: r.cols,
        rows: r.rows,
      });
      sessions.set(r.session_name, session);
      setCurrentSession(r.session_name);
      resetIdleTimer();
      return { type: "start", session_id: r.session_name };
    }

    case "use": {
      const r = req as UseRequest;
      const nameErr = validateSessionName(r.session_id);
      if (nameErr) return { type: "error", message: nameErr };
      if (!sessions.has(r.session_id)) {
        return { type: "error", message: `Session not found: ${r.session_id}` };
      }
      setCurrentSession(r.session_id);
      return { type: "use", session_id: r.session_id, ok: true };
    }

    case "screen": {
      const r = req as ScreenRequest;
      const sessionOrError = getCurrentSession();
      if ("type" in sessionOrError && sessionOrError.type === "error") return sessionOrError;
      const session = sessionOrError as Session;
      const snap = r.done ? await doneSnapshot(session) : session.snapshot();
      return screenResponse(session, currentSession!, "screen", snap);
    }

    case "type": {
      const r = req as TypeRequest;
      const sessionOrError = getCurrentSession();
      if ("type" in sessionOrError && sessionOrError.type === "error") return sessionOrError;
      const session = sessionOrError as Session;
      try {
        session.send(r.input);
        const snap = await doneSnapshot(session);
        return screenResponse(session, currentSession!, "type", snap);
      } catch (e: unknown) {
        return {
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        };
      }
    }

    case "press": {
      const r = req as PressRequest;
      const sessionOrError = getCurrentSession();
      if ("type" in sessionOrError && sessionOrError.type === "error") return sessionOrError;
      const session = sessionOrError as Session;
      try {
        session.press(r.sequence);
        const snap = await doneSnapshot(session);
        return screenResponse(session, currentSession!, "press", snap);
      } catch (e: unknown) {
        return {
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        };
      }
    }

    case "kill": {
      if (!currentSession) {
        return { type: "error", message: "No current session. Run 'ttc use <session-name>' first." };
      }
      const session = sessions.get(currentSession);
      if (!session) {
        return { type: "error", message: `Session not found: ${currentSession}` };
      }
      session.kill();
      sessions.delete(currentSession);
      setCurrentSession(null);
      resetIdleTimer();
      return { type: "kill", ok: true };
    }

    case "list": {
      const list = [...sessions.values()].map((s) => s.toInfo());
      return { type: "list", sessions: list, current: currentSession ?? undefined };
    }

    case "scroll": {
      const sessionOrError = getCurrentSession();
      if ("type" in sessionOrError && sessionOrError.type === "error") return sessionOrError;
      const session = sessionOrError as Session;
      const r = req as ScrollRequest;
      session.scroll(r.direction);
      return screenResponse(session, currentSession!, "scroll", session.snapshot());
    }

    case "info": {
      if (!currentSession) {
        return { type: "error", message: "No current session. Run 'ttc use <session-name>' first." };
      }
      const session = sessions.get(currentSession);
      if (!session) {
        return { type: "error", message: `Session not found: ${currentSession}` };
      }
      return {
        type: "info",
        session_id: session.id,
        label: session.label,
        command: session.command,
        status: session.status,
        exit_code: session.exitCode,
        start_time: session.startTime,
        cols: session.cols,
        rows: session.rows,
      };
    }

    case "rename": {
      if (!currentSession) {
        return { type: "error", message: "No current session. Run 'ttc use <session-name>' first." };
      }
      const session = sessions.get(currentSession);
      if (!session) {
        return { type: "error", message: `Session not found: ${currentSession}` };
      }
      const r = req as import("./protocol").RenameRequest;
      session.rename(r.label);
      return { type: "rename", ok: true, label: r.label };
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
      message += `\n  Port ${DAEMON_PORT} is already in use. Try:\n    ttc daemon stop`;
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
