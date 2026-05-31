/**
 * ttc protocol — CLI RPC request/response types (POST /rpc JSON body).
 */

export interface StartRequest {
  type: "start";
  session_name: string;
  command: string[];
  cwd: string;
}

export interface StartResponse {
  type: "screen";
  screen: string;
}

export interface NowRequest {
  type: "now";
  session_name: string;
}

export interface NowResponse {
  type: "screen";
  screen: string;
}

export interface DoneRequest {
  type: "done";
  session_name: string;
}

export interface DoneResponse {
  type: "screen";
  screen: string;
}

export interface TextRequest {
  type: "text";
  session_name: string;
  text: string;
}

export interface TextResponse {
  type: "screen";
  screen: string;
}

export interface PressRequest {
  type: "press";
  session_name: string;
  key: string;
}

export interface PressResponse {
  type: "screen";
  screen: string;
}

export interface ScrollRequest {
  type: "scroll";
  session_name: string;
  direction: "up" | "down" | "top" | "bottom";
}

export interface ScrollResponse {
  type: "screen";
  screen: string;
}

export interface KillRequest {
  type: "kill";
  session_name: string;
}

export interface KillResponse {
  type: "kill";
  ok: boolean;
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

export interface ErrorResponse {
  type: "error";
  message: string;
}

export type Request =
  | StartRequest
  | NowRequest
  | DoneRequest
  | TextRequest
  | PressRequest
  | KillRequest
  | ListRequest
  | ScrollRequest;

export type ScreenResponse =
  | StartResponse
  | NowResponse
  | DoneResponse
  | TextResponse
  | PressResponse
  | ScrollResponse;

export type Response = ScreenResponse | KillResponse | ListResponse | ErrorResponse;
