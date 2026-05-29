/**
 * ttc protocol — CLI ↔ daemon IPC (newline-delimited JSON)
 */

// ---- Requests ----

export type Request =
  | StartRequest
  | ScreenRequest
  | TypeRequest
  | PressRequest
  | KillRequest
  | ListRequest
  | UseRequest
  | ScrollRequest
  | InfoRequest
  | RenameRequest;

export interface StartRequest {
  type: "start";
  session_name: string;
  command: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

/** now: done=false, done: done=true */
export interface ScreenRequest {
  type: "screen";
  done: boolean;
}

export interface TypeRequest {
  type: "type";
  input: string;
}

export interface PressRequest {
  type: "press";
  key: string;
}

export interface KillRequest {
  type: "kill";
}

export interface ListRequest {
  type: "list";
}

export interface UseRequest {
  type: "use";
  session_id: string;
}

export interface ScrollRequest {
  type: "scroll";
  direction: "up" | "down" | "top" | "bottom";
}

export interface InfoRequest {
  type: "info";
}

export interface RenameRequest {
  type: "rename";
  label: string;
}

// ---- Responses ----

export type Response =
  | StartResponse
  | ScreenResponse
  | KillResponse
  | ListResponse
  | UseResponse
  | InfoResponse
  | RenameResponse
  | ErrorResponse;

export interface StartResponse {
  type: "start";
  session_id: string;
}

export interface ScreenResponse {
  type: "screen" | "type" | "press" | "scroll";
  session_id: string;
  lines: string[];
  changed: boolean;
  status: "running" | "exited";
  exit_code: number | null;
  title: string;
  is_fullscreen: boolean;
  cols: number;
  rows: number;
  highlights: Array<{
    line: number;
    col_start: number;
    col_end: number;
    text: string;
  }>;
}

export interface KillResponse {
  type: "kill";
  ok: boolean;
}

export interface ListResponse {
  type: "list";
  sessions: SessionInfo[];
  current?: string;
}

export interface UseResponse {
  type: "use";
  session_id: string;
  ok: boolean;
}

export interface SessionInfo {
  session_id: string;
  label: string;
  command: string;
  status: "running" | "exited";
  exit_code: number | null;
  start_time: number;
}

export interface InfoResponse {
  type: "info";
  session_id: string;
  label: string;
  command: string;
  status: "running" | "exited";
  exit_code: number | null;
  start_time: number;
  cols: number;
  rows: number;
}

export interface RenameResponse {
  type: "rename";
  ok: boolean;
  label: string;
}

export interface ErrorResponse {
  type: "error";
  message: string;
}
