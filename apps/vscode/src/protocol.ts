/**
 * The webview <-> extension-host wire protocol.
 *
 * Shared by both bundles, so a change to a message shape breaks the typecheck
 * on both sides at once rather than at runtime in a webview nobody is watching.
 */

/** Every host method the webview can invoke, with its argument tuple. */
export interface HostCalls {
  root: [];
  list: [];
  read: [id: string];
  writeDraft: [id: string, dsl: string];
  writeDraftMany: [updates: { id: string; dsl: string }[]];
  create: [id: string, dsl: string];
  mkdir: [dirPath: string];
  delete: [id: string];
  rmdir: [dirPath: string];
  rename: [fromId: string, toId: string];
  checkpoint: [opts: { message?: string; files?: { id: string; dsl: string }[] }];
  flagNewVersion: [commitSha: string, opts: { name: string; note?: string }];
  alert: [message: string];
  confirm: [message: string];
  prompt: [message: string, defaultValue: string];
  exportFile: [name: string, contents: string, encoding: "utf8" | "base64"];
}

export type HostMethod = keyof HostCalls;

export interface RequestMessage {
  kind: "request";
  id: number;
  method: HostMethod;
  args: unknown[];
}

export interface ResponseMessage {
  kind: "response";
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

/** Pushed from the host, unsolicited. */
export interface EventMessage {
  kind: "event";
  event: "fileChanged" | "status";
  payload: unknown;
}

export type WebviewMessage = RequestMessage;
export type HostMessage = ResponseMessage | EventMessage;

export interface FileChangedPayload {
  id: string;
  dsl: string | null;
  type: "add" | "change" | "unlink";
}

export interface StatusPayload {
  branch: string | null;
  dirty: number;
  trusted: boolean;
  /** Present when the workspace is not a usable git repo. */
  gitProblem: string | null;
}
