/**
 * Long-lived daemon connection for PTY stream subscription (ttc watch).
 */
import * as net from "net";
import { SOCKET_PATH, DAEMON_PORT } from "./daemon";
import {
  StreamMessage,
  StreamSubscribedMessage,
} from "./protocol";

function createConnection(): net.Socket {
  if (process.platform === "win32") {
    return net.createConnection(DAEMON_PORT);
  }
  return net.createConnection(SOCKET_PATH);
}

export interface SessionStreamHandlers {
  onSubscribed: (info: StreamSubscribedMessage) => void;
  onData: (data: string) => void;
  onEnd: (exitCode: number | null) => void;
  onError: (message: string) => void;
}

/** Subscribe to live PTY output for one session. Returns close function. */
export function openSessionStream(
  sessionName: string,
  handlers: SessionStreamHandlers
): () => void {
  const socket = createConnection();
  let buffer = "";
  let closed = false;

  function close(): void {
    if (closed) return;
    closed = true;
    try {
      socket.write(
        JSON.stringify({ type: "stream_unsubscribe", session_name: sessionName }) + "\n"
      );
    } catch {
      /* socket may already be gone */
    }
    socket.destroy();
  }

  socket.on("connect", () => {
    socket.write(
      JSON.stringify({ type: "stream_subscribe", session_name: sessionName }) + "\n"
    );
  });

  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      let msg: StreamMessage;
      try {
        msg = JSON.parse(line) as StreamMessage;
      } catch {
        handlers.onError("Invalid stream JSON from daemon");
        continue;
      }

      switch (msg.type) {
        case "stream_subscribed":
          handlers.onSubscribed(msg);
          break;
        case "stream_data":
          handlers.onData(msg.data);
          break;
        case "stream_end":
          handlers.onEnd(msg.exit_code);
          break;
        case "error":
          handlers.onError(msg.message);
          close();
          break;
      }
    }
  });

  socket.on("error", (err) => {
    if (!closed) handlers.onError(err.message);
  });

  socket.on("close", () => {
    closed = true;
  });

  return close;
}
