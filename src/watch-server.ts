/**
 * Local read-only web UI for observing all ttc sessions (human-only).
 */
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { AddressInfo } from "net";
import { WebSocketServer, WebSocket } from "ws";
import { sendRequest, ensureDaemonRunning } from "./client";
import { openSessionStream } from "./stream-client";
import { ListResponse, StreamSubscribedMessage } from "./protocol";
import { SESSION_NAME_PATTERN } from "./session";

const UI_DIR = path.join(__dirname, "..", "watch-ui");

interface SessionRelay {
  clients: Set<WebSocket>;
  closeDaemon: (() => void) | null;
  subscribed: StreamSubscribedMessage | null;
}

const relays = new Map<string, SessionRelay>();

function contentType(filePath: string): string {
  switch (path.extname(filePath)) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    default: return "application/octet-stream";
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res: http.ServerResponse, status: number, body: string, type = "text/plain; charset=utf-8"): void {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function serveStatic(relativePath: string, res: http.ServerResponse): void {
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(UI_DIR, safePath);
  if (!filePath.startsWith(UI_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendText(res, 404, "Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  });
}

async function fetchSessions(): Promise<ListResponse["sessions"]> {
  const res = await sendRequest({ type: "list" });
  if (res.type !== "list") return [];
  return res.sessions;
}

function renderTabsPartial(sessions: ListResponse["sessions"], active?: string): string {
  if (sessions.length === 0) {
    return `<p class="empty">No active sessions. Start one with <code>ttc start &lt;name&gt;</code>.</p>`;
  }

  const tabs = sessions
    .map((s) => {
      const selected = s.session_name === active ? " active" : "";
      const statusClass = s.status === "exited" ? " exited" : "";
      return `<button type="button" class="tab${selected}${statusClass}" data-session="${s.session_name}">${s.session_name}<span class="status">${s.status}</span></button>`;
    })
    .join("\n");

  return `<nav class="tabs">${tabs}</nav>`;
}

function wsSend(ws: WebSocket, payload: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getRelay(sessionName: string): SessionRelay {
  let relay = relays.get(sessionName);
  if (!relay) {
    relay = { clients: new Set(), closeDaemon: null, subscribed: null };
    relays.set(sessionName, relay);
  }
  return relay;
}

function ensureDaemonRelay(sessionName: string, relay: SessionRelay): void {
  if (relay.closeDaemon) return;

  relay.closeDaemon = openSessionStream(sessionName, {
    onSubscribed: (info) => {
      relay.subscribed = info;
      for (const client of relay.clients) {
        wsSend(client, { type: "init", session_name: info.session_name, replay: info.replay, cols: info.cols, rows: info.rows, status: info.status, exit_code: info.exit_code });
      }
    },
    onData: (data) => {
      for (const client of relay.clients) {
        wsSend(client, { type: "data", data });
      }
    },
    onEnd: (exitCode) => {
      for (const client of relay.clients) {
        wsSend(client, { type: "end", exit_code: exitCode });
      }
      if (relay.closeDaemon) {
        relay.closeDaemon();
        relay.closeDaemon = null;
      }
    },
    onError: (message) => {
      for (const client of relay.clients) {
        wsSend(client, { type: "error", message });
      }
      if (relay.closeDaemon) {
        relay.closeDaemon();
        relay.closeDaemon = null;
      }
    },
  });
}

function attachClient(sessionName: string, ws: WebSocket): void {
  const relay = getRelay(sessionName);
  relay.clients.add(ws);
  ensureDaemonRelay(sessionName, relay);

  if (relay.subscribed) {
    const info = relay.subscribed;
    wsSend(ws, { type: "init", session_name: info.session_name, replay: info.replay, cols: info.cols, rows: info.rows, status: info.status, exit_code: info.exit_code });
  }

  ws.on("close", () => {
    relay.clients.delete(ws);
    if (relay.clients.size === 0) {
      if (relay.closeDaemon) {
        relay.closeDaemon();
        relay.closeDaemon = null;
      }
      relays.delete(sessionName);
    }
  });
}

function handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  if (pathname === "/" || pathname === "/index.html") {
    serveStatic("index.html", res);
    return;
  }

  if (pathname === "/partials/tabs") {
    fetchSessions()
      .then((sessions) => {
        const active = url.searchParams.get("active") ?? undefined;
        sendText(res, 200, renderTabsPartial(sessions, active), "text/html; charset=utf-8");
      })
      .catch((err) => {
        sendText(res, 500, err instanceof Error ? err.message : String(err));
      });
    return;
  }

  if (pathname === "/api/sessions") {
    fetchSessions()
      .then((sessions) => sendJson(res, 200, { sessions }))
      .catch((err) => {
        sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      });
    return;
  }

  if (pathname.startsWith("/")) {
    serveStatic(pathname.slice(1), res);
    return;
  }

  sendText(res, 404, "Not found");
}

/** Start read-only watch server; blocks until SIGINT/SIGTERM. */
export async function runWatchServer(): Promise<void> {
  if (!process.stdout.isTTY) {
    process.stderr.write(
      "Error: ttc watch is for human observation only. Agents must not run this command.\n"
    );
    process.exit(1);
  }

  await ensureDaemonRunning();

  const server = http.createServer(handleHttp);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = url.pathname.match(/^\/ws\/([a-zA-Z0-9]+)$/);
    if (!match || !SESSION_NAME_PATTERN.test(match[1])) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      attachClient(match[1], ws);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}`;

  process.stderr.write("ttc watch — read-only session observer (Ctrl+C to stop)\n");
  console.log(url);

  await new Promise<void>((resolve) => {
    const stop = () => {
      for (const relay of relays.values()) {
        relay.closeDaemon?.();
      }
      relays.clear();
      wss.close();
      server.close(() => resolve());
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
