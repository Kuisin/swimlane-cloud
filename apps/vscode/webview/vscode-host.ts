/**
 * The webview half of the EditorHost.
 *
 * Structurally identical to `apps/desktop/src/desktop-host.js` — every method
 * forwards to the extension host and returns its answer — but over
 * `postMessage` with request-id correlation instead of Electron's synchronous
 * `window.api` bridge.
 */

import type { FileChangedPayload, HostCalls, HostMessage, HostMethod } from "../src/protocol";
import { vscodeApi } from "./vscode-api";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

const pending = new Map<number, Pending>();
const fileWatchers = new Set<(e: FileChangedPayload) => void>();
const statusWatchers = new Set<(s: unknown) => void>();
let nextId = 1;

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  const msg = event.data;
  if (!msg) return;

  if (msg.kind === "event") {
    if (msg.event === "fileChanged")
      fileWatchers.forEach((cb) => cb(msg.payload as FileChangedPayload));
    if (msg.event === "status") statusWatchers.forEach((cb) => cb(msg.payload));
    return;
  }

  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  if (msg.ok) entry.resolve(msg.value);
  else entry.reject(new Error(msg.error ?? "The extension host reported an error."));
});

function call<M extends HostMethod>(method: M, ...args: HostCalls[M]): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    vscodeApi().postMessage({ kind: "request", id, method, args });
  });
}

export function onStatus(cb: (s: unknown) => void): () => void {
  statusWatchers.add(cb);
  return () => statusWatchers.delete(cb);
}

export const vscodeHost = {
  capabilities: { readOnly: false, versioning: true },

  root: () => call("root") as Promise<string | null>,
  list: () => call("list") as Promise<{ id: string; name: string; mtime?: number }[]>,
  read: (id: string) => call("read", id) as Promise<string>,

  // A filesystem host has no draft layer: writing the file IS the save, and
  // git is what makes it recoverable. Same mapping as the desktop host.
  writeDraft: async (id: string, dsl: string) => void (await call("writeDraft", id, dsl)),
  writeDraftMany: async (updates: { id: string; dsl: string }[]) =>
    void (await call("writeDraftMany", updates)),

  create: async (id: string, dsl: string) => void (await call("create", id, dsl)),
  mkdir: async (dirPath: string) => void (await call("mkdir", dirPath)),
  delete: async (id: string) => void (await call("delete", id)),
  rmdir: async (dirPath: string) => void (await call("rmdir", dirPath)),
  rename: async (fromId: string, toId: string) => void (await call("rename", fromId, toId)),

  checkpoint: async (opts: { message?: string; files?: { id: string; dsl: string }[] } = {}) =>
    void (await call("checkpoint", opts)),

  // The editor passes the literal string "HEAD" (dsl-editor.jsx:288), so the
  // host resolves the real sha itself rather than trusting the argument.
  flagNewVersion: async (commitSha: string, opts: { name: string; note?: string }) =>
    void (await call("flagNewVersion", commitSha, opts)),

  watch(cb: (e: FileChangedPayload) => void): () => void {
    fileWatchers.add(cb);
    return () => fileWatchers.delete(cb);
  },
};

/**
 * Real dialogs, routed to the workbench.
 *
 * Without these the editor is not degraded but broken: a webview iframe is not
 * granted `allow-modals`, so `confirm()` returns false and `prompt()` returns
 * null, which silently turns every New/Delete/Checkpoint into a no-op and makes
 * every "discard unsaved changes?" answer itself "no".
 *
 * `showInputBox` resolves to `undefined` on cancel where the browser returns
 * `null`, so cancellation is normalised here — the editor's checkpoint handler
 * compares loosely, but the extension must not depend on that.
 */
export const vscodeDialogs = {
  alert: async (message: string) => void (await call("alert", message)),
  confirm: (message: string) => call("confirm", message) as Promise<boolean>,
  prompt: async (message: string, defaultValue = ""): Promise<string | null> => {
    const value = (await call("prompt", message, defaultValue)) as string | null | undefined;
    return value ?? null;
  },
};
