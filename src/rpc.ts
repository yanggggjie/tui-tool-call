/**
 * PTY session registry and RPC handlers.
 */
import * as path from "path";
import { Session, validateCwd, validateSessionName } from "./session";
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
  SessionInfo,
  ErrorResponse,
} from "./protocol";

const WAIT_MS = 3000;
const DEBOUNCE_MS = 100;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

const sessions = new Map<string, Session>();
const startingSessions = new Set<string>();
let idleTimer: NodeJS.Timeout | null = null;

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if ([...sessions.values()].every((s) => s.status === "exited")) {
      process.exit(0);
    }
  }, IDLE_TIMEOUT_MS);
  idleTimer.unref();
}

function getSession(name: string): Session | ErrorResponse {
  const nameErr = validateSessionName(name);
  if (nameErr) return { type: "error", message: nameErr };
  const session = sessions.get(name);
  if (!session) return { type: "error", message: `Session not found: ${name}` };
  return session;
}

const SESSION_IN_USE_HINT = (name: string) =>
  `Session "${name}" is already in use. Use a different session name, or run 'ttc kill ${name}' first.`;

function checkSessionNameAvailable(name: string): Response | null {
  if (startingSessions.has(name)) {
    return { type: "error", message: SESSION_IN_USE_HINT(name) };
  }
  const existing = sessions.get(name);
  if (!existing) return null;
  if (existing.status === "running") {
    return { type: "error", message: SESSION_IN_USE_HINT(name) };
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

export function listSessions(): SessionInfo[] {
  return [...sessions.values()].map((s) => s.toInfo());
}

export function resolveSession(name: string): Session | ErrorResponse {
  return getSession(name);
}

export function killAllSessions(): void {
  for (const session of sessions.values()) {
    try {
      session.kill();
    } catch {
      /* ignore */
    }
  }
}

export function armIdleTimer(): void {
  resetIdleTimer();
}

export async function handleRequest(req: Request): Promise<Response> {
  switch (req.type) {
    case "start": {
      const r = req as StartRequest;
      const nameErr = validateSessionName(r.session_name);
      if (nameErr) return { type: "error", message: nameErr };
      if (!Array.isArray(r.command) || r.command.length === 0) {
        return { type: "error", message: "command required (e.g. npm run dev)" };
      }
      const cwdErr = validateCwd(r.cwd);
      if (cwdErr) return { type: "error", message: cwdErr };
      const unavailable = checkSessionNameAvailable(r.session_name);
      if (unavailable) return unavailable;

      startingSessions.add(r.session_name);
      try {
        const session = new Session(r.session_name, r.command, {
          cwd: path.resolve(r.cwd),
        });
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
        return { type: "error", message: e instanceof Error ? e.message : String(e) };
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
        return { type: "error", message: e instanceof Error ? e.message : String(e) };
      }
    }

    case "kill": {
      const r = req as KillRequest;
      const sessionOrError = getSession(r.session_name);
      if ("type" in sessionOrError && sessionOrError.type === "error") return sessionOrError;
      (sessionOrError as Session).kill();
      sessions.delete(r.session_name);
      resetIdleTimer();
      return { type: "kill", ok: true };
    }

    case "list":
      return { type: "list", sessions: listSessions() };

    case "scroll": {
      const r = req as ScrollRequest;
      const sessionOrError = getSession(r.session_name);
      if ("type" in sessionOrError && sessionOrError.type === "error") return sessionOrError;
      const session = sessionOrError as Session;
      session.scroll(r.direction);
      return screenResponse(session, r.session_name, "scroll", session.snapshot());
    }

    default:
      return { type: "error", message: "Unknown request type" };
  }
}
