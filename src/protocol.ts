/**
 * ttc protocol — CLI RPC request/response types (POST /rpc JSON body).
 */

export interface StartRequest {
  type: "start";
  session_name: string;
  command: string[];
  cwd: string;
}

export interface TextRequest {
  type: "text";
  session_name: string;
  text: string;
}

export interface PressRequest {
  type: "press";
  session_name: string;
  key: string;
}

export interface NowRequest {
  type: "now";
  session_name: string;
}

export interface DoneRequest {
  type: "done";
  session_name: string;
}

export interface ScrollRequest {
  type: "scroll";
  session_name: string;
  direction: "up" | "down" | "top" | "bottom";
}

export interface KillRequest {
  type: "kill";
  session_name: string;
}

export interface KillResponse {
  type: "kill";
  ok: boolean;
}

export interface KillAllRequest {
  type: "killall";
}

export interface KillAllResponse {
  type: "killall";
  ok: boolean;
  count: number;
}

export interface ListRequest {
  type: "list";
}

export interface SessionInfo {
  session_name: string;
}

export interface ListResponse {
  type: "list";
  sessions: SessionInfo[];
}

export interface OkResponse {
  type: "ok";
}

export interface ScreenResponse {
  type: "screen";
  screen: string;
}

export interface ErrorResponse {
  type: "error";
  message: string;
}

export type Request =
  | StartRequest
  | TextRequest
  | PressRequest
  | NowRequest
  | DoneRequest
  | ScrollRequest
  | KillRequest
  | KillAllRequest
  | ListRequest;

export type Response =
  | OkResponse
  | ScreenResponse
  | KillResponse
  | KillAllResponse
  | ListResponse
  | ErrorResponse;
