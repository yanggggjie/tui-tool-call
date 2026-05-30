/**
 * ttc protocol — CLI RPC request/response types (POST /rpc JSON body).
 */

export type Request =
  | StartRequest
  | ScreenRequest
  | TypeRequest
  | PressRequest
  | KillRequest
  | ListRequest
  | ScrollRequest;

export interface StartRequest {
  type: "start";
  session_name: string;
  command: string[];
  cwd: string;
}

/** now: done=false, done: done=true */
export interface ScreenRequest {
  type: "screen";
  session_name: string;
  done: boolean;
}

export interface TypeRequest {
  type: "type";
  session_name: string;
  input: string;
}

export interface PressRequest {
  type: "press";
  session_name: string;
  sequence: string;
}

export interface KillRequest {
  type: "kill";
  session_name: string;
}

export interface ListRequest {
  type: "list";
}

export interface ScrollRequest {
  type: "scroll";
  session_name: string;
  direction: "up" | "down" | "top" | "bottom";
}

export type Response =
  | ScreenResponse
  | KillResponse
  | ListResponse
  | ErrorResponse;

export interface ScreenResponse {
  type: "screen" | "start" | "type" | "press" | "scroll";
  session_name: string;
  lines: string[];
  changed: boolean;
  status: "running" | "exited";
  exit_code: number | null;
  title: string;
  is_fullscreen: boolean;
  cols: number;
  rows: number;
}

export interface KillResponse {
  type: "kill";
  ok: boolean;
}

export interface ListResponse {
  type: "list";
  sessions: SessionInfo[];
}

export interface SessionInfo {
  session_name: string;
  command: string;
  status: "running" | "exited";
  exit_code: number | null;
  start_time: number;
}

export interface ErrorResponse {
  type: "error";
  message: string;
}
