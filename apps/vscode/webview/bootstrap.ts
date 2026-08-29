/**
 * Runs before React mounts, and replaces two browser APIs the editor assumes.
 *
 * Both are load-bearing:
 *
 *  - `window.localStorage` is read by three hooks in the editor package
 *    (`use-persistent-state`, `use-split-pane`, `use-drag-width`) for six
 *    `sw-editor:*` layout keys, with no try/catch inside their effects. A
 *    webview's storage origin is not stable across sessions, so backing them
 *    with `getState`/`setState` both survives reloads properly and puts the
 *    state where VS Code expects it.
 *
 *  - `window.alert/confirm/prompt` are disabled in a webview iframe: `confirm`
 *    returns false and `prompt` returns null. The editor uses these for New
 *    file, New folder, Delete, Checkpoint and Flag version, so without a
 *    replacement every one of those silently does nothing. We inject real
 *    dialogs via the `dialogs` prop, but the shim below stops any path we
 *    missed from failing quietly.
 */

import { vscodeApi } from "./vscode-api";

export function installShims(): void {
  const api = vscodeApi();
  const state: Record<string, string> = { ...(api.getState() ?? {}) };

  const storage: Storage = {
    get length() {
      return Object.keys(state).length;
    },
    key: (i: number) => Object.keys(state)[i] ?? null,
    getItem: (k: string) => (k in state ? state[k]! : null),
    setItem: (k: string, v: string) => {
      state[k] = String(v);
      api.setState({ ...state });
    },
    removeItem: (k: string) => {
      delete state[k];
      api.setState({ ...state });
    },
    clear: () => {
      for (const k of Object.keys(state)) delete state[k];
      api.setState({});
    },
  };

  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });

  // Loud rather than silent: a dialog we forgot to route should show up in the
  // webview devtools console, not vanish.
  const unsupported = (name: string) => () => {
    console.error(
      `window.${name} is unavailable in a webview; this action needs an injected dialog.`,
    );
    return undefined as never;
  };
  Object.defineProperty(window, "alert", { value: unsupported("alert"), configurable: true });
  Object.defineProperty(window, "confirm", { value: unsupported("confirm"), configurable: true });
  Object.defineProperty(window, "prompt", { value: unsupported("prompt"), configurable: true });
}
