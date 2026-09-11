/**
 * Pure, per-document undo/redo over DSL-string snapshots. Both text mode
 * (`<textarea onChange>`) and GUI mode (`applyModelEdit` → `onChange`) funnel
 * through the same `updateActiveDocumentSrc` choke point in
 * `file-editor-provider.jsx`, so one linear history of `src` strings captures
 * every edit from either mode with a single mechanism.
 *
 * Consecutive `"typing"`-tagged pushes within `COALESCE_MS` of each other
 * merge into the current entry (so undo steps back through meaningful
 * chunks, not one keystroke at a time). Every `"structural"`-tagged push
 * (a GUI-mode mutation — add/delete/move/patch a row) is always a discrete
 * entry and never coalesces with anything, including another structural
 * push, so each GUI action is its own undo step.
 */

const MAX_ENTRIES = 100;
const COALESCE_MS = 600;

/** A fresh history anchored at `initialSrc` — nothing to undo yet. */
export function createHistory(initialSrc) {
  return { entries: [initialSrc], index: 0, lastPushAt: 0, lastTag: null };
}

/**
 * Record `src` as the new current entry. A push identical to the current
 * entry is a no-op (guards against a re-render firing onChange with
 * unchanged content). Pushing after an undo drops the redo-able future —
 * standard undo-stack semantics, matching every text editor.
 */
export function pushHistory(history, src, { tag = "typing", now = Date.now() } = {}) {
  if (history.entries[history.index] === src) return history;

  const atTip = history.index === history.entries.length - 1;
  const canCoalesce =
    atTip &&
    tag === "typing" &&
    history.lastTag === "typing" &&
    now - history.lastPushAt < COALESCE_MS;

  let entries = canCoalesce
    ? history.entries.slice(0, history.index)
    : history.entries.slice(0, history.index + 1);
  entries.push(src);
  let index = entries.length - 1;

  if (entries.length > MAX_ENTRIES) {
    const drop = entries.length - MAX_ENTRIES;
    entries = entries.slice(drop);
    index -= drop;
  }

  return { entries, index, lastPushAt: now, lastTag: tag };
}

export function canUndo(history) {
  return history.index > 0;
}

export function canRedo(history) {
  return history.index < history.entries.length - 1;
}

/** Step back one entry. No-op (same reference) at the start of history. */
export function undo(history) {
  if (!canUndo(history)) return history;
  return { ...history, index: history.index - 1, lastTag: null };
}

/** Step forward one entry. No-op (same reference) at the tip of history. */
export function redo(history) {
  if (!canRedo(history)) return history;
  return { ...history, index: history.index + 1, lastTag: null };
}

export function currentSrc(history) {
  return history.entries[history.index];
}
