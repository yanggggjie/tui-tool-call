/**
 * HTTP + WebSocket server for CLI RPC and human watch UI.
 */
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { Session } from "./session";
import { handleRequest, listSessions, resolveSession } from "./rpc";
import { Request } from "./protocol";
import { SESSION_NAME_PATTERN } from "./session";

const UI_DIR = path.join(__dirname, "..", "watch-ui");

interface StreamInit {
  session_name: string;
  replay: string;
  cols: number;
  rows: number;
  status: "running" | "exited";
  exit_code: number | null;
}

interface SessionRelay {
  clients: Set<WebSocket>;
  unsubData: (() => void) | null;
  unsubExit: (() => void) | null;
  init: StreamInit | null;
}

const relays = new Map<string, SessionRelay>();

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(
  res: http.ServerResponse,
  status: number,
  body: string,
  type = "text/plain; charset=utf-8"
): void {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function contentType(filePath: string): string {
  switch (path.extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
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

function renderTabsPartial(sessions: ReturnType<typeof listSessions>, active?: string): string {
  if (sessions.length === 0) {
    return `<p class="empty">No active sessions. Start one with <code>ttc start &lt;name&gt; &lt;command...&gt;</code>.</p>`;
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
    relay = { clients: new Set(), unsubData: null, unsubExit: null, init: null };
    relays.set(sessionName, relay);
  }
  return relay;
}

function stopRelay(sessionName: string, relay: SessionRelay): void {
  relay.unsubData?.();
  relay.unsubExit?.();
  relay.unsubData = null;
  relay.unsubExit = null;
  relays.delete(sessionName);
}

function ensureSessionStream(sessionName: string, relay: SessionRelay): void {
  if (relay.unsubData) return;

  const sessionOrError = resolveSession(sessionName);
  if ("type" in sessionOrError) {
    for (const client of relay.clients) {
      wsSend(client, { type: "error", message: sessionOrError.message });
    }
    return;
  }

  const session: Session = sessionOrError;
  relay.init = {
    session_name: sessionName,
    replay: session.getStreamReplay(),
    cols: session.cols,
    rows: session.rows,
    status: session.status,
    exit_code: session.exitCode,
  };

  for (const client of relay.clients) {
    wsSend(client, { type: "init", ...relay.init });
  }

  relay.unsubData = session.onStream((data) => {
    for (const client of relay.clients) {
      wsSend(client, { type: "data", data });
    }
  });

  relay.unsubExit = session.onExit((exitCode) => {
    for (const client of relay.clients) {
      wsSend(client, { type: "end", exit_code: exitCode });
    }
    stopRelay(sessionName, relay);
  });

  if (session.status === "exited") {
    for (const client of relay.clients) {
      wsSend(client, { type: "end", exit_code: session.exitCode });
    }
    stopRelay(sessionName, relay);
  }
}

function attachWebSocketClient(sessionName: string, ws: WebSocket): void {
  const relay = getRelay(sessionName);
  relay.clients.add(ws);
  ensureSessionStream(sessionName, relay);

  if (relay.init) {
    wsSend(ws, { type: "init", ...relay.init });
  }

  ws.on("close", () => {
    relay.clients.delete(ws);
    if (relay.clients.size === 0) {
      stopRelay(sessionName, relay);
    }
  });
}

async function handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/rpc") {
    try {
      const body = (await readJsonBody(req)) as Request;
      const result = await handleRequest(body);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/partials/tabs") {
    const active = url.searchParams.get("active") ?? undefined;
    sendText(res, 200, renderTabsPartial(listSessions(), active), "text/html; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/sessions") {
    sendJson(res, 200, { sessions: listSessions() });
    return;
  }

  if (req.method === "GET") {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      serveStatic("index.html", res);
      return;
    }
    serveStatic(url.pathname.slice(1), res);
    return;
  }

  sendText(res, 404, "Not found");
}

export function startHttpServer(): http.Server {
  const server = http.createServer((req, res) => {
    handleHttp(req, res).catch((err) => {
      sendJson(res, 500, {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    });
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const match = url.pathname.match(/^\/ws\/([a-zA-Z0-9]+)$/);
    if (!match || !SESSION_NAME_PATTERN.test(match[1])) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      attachWebSocketClient(match[1], ws);
    });
  });

  return server;
}
