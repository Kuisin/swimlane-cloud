/**
 * localStorage mirror of unsaved editor documents, keyed by an opaque
 * `scope` (the host chooses one, typically project+branch) and a document
 * id. Autosave already reaches the server on a debounce, but a browser tab
 * closed mid-debounce would otherwise lose the last few keystrokes; the
 * mirror is what `openFile` checks on the next load to recover them.
 */

const PREFIX = "sw-mirror:";

export function mirrorKey(scope, id) {
  return `${PREFIX}${scope}:${id}`;
}

export function writeMirror(storage, scope, id, src, base) {
  if (!storage) return;
  try {
    storage.setItem(mirrorKey(scope, id), JSON.stringify({ src, base, at: Date.now() }));
  } catch {
    /* storage full or unavailable; the server-side autosave still applies */
  }
}

export function readMirror(storage, scope, id) {
  if (!storage) return null;
  let raw;
  try {
    raw = storage.getItem(mirrorKey(scope, id));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.src !== "string" || typeof parsed?.base !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearMirror(storage, scope, id) {
  if (!storage) return;
  try {
    storage.removeItem(mirrorKey(scope, id));
  } catch {
    /* ignore */
  }
}

/** Removes every mirrored document under `scope` (e.g. after a successful push). */
export function clearScope(storage, scope) {
  if (!storage) return;
  const prefix = `${PREFIX}${scope}:`;
  const toRemove = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) toRemove.push(key);
    }
    for (const key of toRemove) storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Decide what to do with a mirrored edit once the host's real content for
 * the same document is known.
 *  - already in sync (`mirror.src === hostContent`) → drop, nothing to restore
 *  - host unchanged since the local edit (`mirror.base === hostContent`) →
 *    restore the local edit; it is strictly newer
 *  - host moved (someone else saved, or a different device) → drop rather
 *    than silently clobbering a save that already happened elsewhere
 */
export function reconcileMirror(mirror, hostContent) {
  if (!mirror) return { action: "drop", src: hostContent };
  if (mirror.src === hostContent) return { action: "drop", src: hostContent };
  if (mirror.base === hostContent) return { action: "restore", src: mirror.src };
  return { action: "drop", src: hostContent };
}

/** Convenience for consumers: clear every mirrored document for `scope` via window.localStorage. */
export function clearLocalMirror(scope) {
  if (typeof window === "undefined" || !window.localStorage) return;
  clearScope(window.localStorage, scope);
}
