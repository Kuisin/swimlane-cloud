/**
 * Rewrite a document written in the earlier grammar into the current one.
 *
 * There is one grammar and one reader now (`parser-v2.js`, behind the plain
 * `@kai-swimlane` header) and it has no compatibility layer, so a file from
 * before the change fails on its first old construct. This is the one-shot
 * rewrite that brings it across — line-based, touching only the constructs
 * that changed, leaving fenced values and definitions alone:
 *
 * - the header: `@kai-swimlane-v2` and `@kai-swimlane 2` → `@kai-swimlane`
 * - a bare, un-hyphenated `else` (no `than`, no parens — the oldest spelling)
 *   → `else-if () than`; the un-hyphenated closers `endif`/`endfork` →
 *   `end-if`/`end-fork`
 * - the previous grammar's `if (q)` + a `case (a)` line right after it →
 *   fused onto one line, `if (q) is (a) than`; a later, bare `case (b)` →
 *   `else-if (b) than`; a fork's `and (b)` → `case (b)` (already-current
 *   `is (a) than` / `else-if (b) than` input passes through unchanged)
 * - an opener's lane selector, `if [sales] (q) …` → `if (q) …`. The selector
 *   was parsed and kept but never drawn from, and it is not in the grammar any
 *   more; dropping it here is what keeps a file that still carries one from
 *   simply starting to error.
 * - `[loop]` → `loop`; `merge: id;` / `[merge: id]` in a case → `[goto: id]`.
 *   A bare `merge;` / `[merge]` in a case, and a `[merge]` / `[merge: n]`
 *   landing marker in the flow, have no automatic mapping — there is no
 *   marker concept any more, so every jump needs a real target id — and are
 *   left untouched; the reader then errors on them, pointing at the line to
 *   fix by hand (name the intended landing step with `id:` and change the
 *   jump to `[goto: id]`).
 * - a step's `props:` / `arrow:` / `link:` lines → the `+prop`, glyph and
 *   `=> path` suffixes on the step itself; a step's `id:` line is unchanged
 *   (it was never a suffix in this grammar); `:` → `[]`
 * - `section-start (n)` / `start-point` / `end-point` → `section` forms;
 *   `***` comments → `//`
 */

const ARROW_GLYPH = { dashed: "~>", dotted: "..>", "dash-dot": "-.>", "long-dash": "-->" };

export function migrateLegacyDsl(text) {
  const lines = String(text ?? "").split("\n");
  const out = [];
  let changed = 0;
  let headerSeen = false;
  let section = null;
  let inFence = false;
  const frames = [];
  /** Index in `out` of the step line a following property line belongs to. */
  let lastStep = -1;

  const push = (indent, next) => {
    changed++;
    out.push(indent + next);
  };
  const popTo = (kinds) => {
    for (let k = frames.length - 1; k >= 0; k--) {
      if (kinds.includes(frames[k])) {
        const kind = frames[k];
        frames.length = k;
        return kind;
      }
    }
    return null;
  };
  const suffix = (s) => {
    if (lastStep < 0) return false;
    out[lastStep] = `${out[lastStep]} ${s}`;
    changed++;
    return true;
  };

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const t = line.trim();
    const indent = line.match(/^\s*/)[0];
    let m;

    if (!headerSeen && t) {
      headerSeen = true;
      if ((m = t.match(/^(﻿?)@kai-swimlane(?:-v\d+(?:\.\d+)?|\s+\d+(?:\.\d+)?)\s*$/))) {
        push("", `${m[1]}@kai-swimlane`);
        continue;
      }
    }
    if (inFence) {
      out.push(line);
      if (/^```;?\s*$/.test(t)) inFence = false;
      continue;
    }
    if (/^[A-Za-z][A-Za-z-]*:\s*```\s*$/.test(t)) {
      inFence = true;
      out.push(line);
      continue;
    }
    if (t.startsWith("***")) {
      push(indent, `//${t.slice(3)}`);
      continue;
    }
    if ((m = t.match(/^\/([a-z0-9]+)\/\s*$/i))) {
      section = m[1].toLowerCase();
      lastStep = -1;
      out.push(line);
      continue;
    }
    if (section !== "line") {
      out.push(line);
      continue;
    }

    // --- flow section -----------------------------------------------------
    const color = (c) => (c ? ` #${c}` : "");
    // An opener's lane selector — `if [sales] (q) …`. Drop the bracket and
    // re-read the line, so whichever rule below owns the rest of it still
    // gets its turn (the fuse rule, most often).
    if ((m = t.match(/^(if|fork|section|branch|phase)\s*\[[^\]]*\]\s*(.*)$/i))) {
      lines[li] = `${indent}${m[1]}${m[2] ? ` ${m[2]}` : ""}`;
      changed++;
      li--;
      continue;
    }
    // The oldest spelling: a bare `else`, no `than`, no parens. An already-
    // current `if (q) is (a) than` / `else-if (b) than` line falls through
    // every rule below unmatched and reaches the final `out.push(line)`.
    if ((m = t.match(/^else(?:\s+than)?(?:\s+#([A-Za-z]+))?\s*$/i))) {
      push(indent, `else-if () than${color(m[1])}`);
      lastStep = -1;
      continue;
    }
    // The previous grammar's bare `if (q)`, with its first case as the very
    // next line — fuse them onto one, `if (q) is (a) than`. Anything else
    // right after (a comment, a blank line) means the first case is missing
    // and this if is already broken; left alone for the reader to say so.
    if ((m = t.match(/^if\s*\((.+?)\)(\s*@[\w-]+)?(\s*#[A-Za-z]+)?\s*$/i))) {
      const next = lines[li + 1];
      const nm = next && /^\s*case\s*\((.*?)\)(\s*#[A-Za-z]+)?\s*$/i.exec(next.trim());
      if (nm) {
        frames.push("if");
        const [, cond, id, ifColor] = m;
        const caseColor = nm[2] ?? "";
        push(
          indent,
          `if (${cond.trim()}) is (${nm[1].trim()}) than${id ?? ""}${ifColor ?? caseColor}`,
        );
        li++; // consumed the fused case line too
        lastStep = -1;
        continue;
      }
    }
    // A later, bare `if`-case — not the first (already fused above) —
    // including the blank `case ()` catch-all. `case` inside a `fork` is
    // already the current spelling for a path, not this construct.
    if (
      frames[frames.length - 1] !== "fork" &&
      (m = t.match(/^case\s*\((.*?)\)(?:\s+#([A-Za-z]+))?\s*$/i))
    ) {
      push(indent, `else-if (${m[1].trim()}) than${color(m[2])}`);
      lastStep = -1;
      continue;
    }
    if (/^end-?if\s*$/i.test(t)) {
      popTo(["if"]);
      if (t !== "end-if") push(indent, "end-if");
      else out.push(line);
      lastStep = -1;
      continue;
    }
    if (/^fork\b/i.test(t)) {
      frames.push("fork");
      out.push(line);
      lastStep = -1;
      continue;
    }
    // A fork path after the first — `and` is the only spelling this ever
    // had; the new grammar reuses `case` for it instead (fork's own opener
    // line, which still names path one, is unchanged).
    if ((m = t.match(/^and\s*\((.*?)\)(?:\s+#([A-Za-z]+))?\s*$/i))) {
      push(indent, `case (${m[1].trim()})${color(m[2])}`);
      lastStep = -1;
      continue;
    }
    if (/^end-?fork\s*$/i.test(t)) {
      popTo(["fork"]);
      if (t !== "end-fork") push(indent, "end-fork");
      else out.push(line);
      lastStep = -1;
      continue;
    }
    if (/^\[loop\]\s*;?\s*$/i.test(t)) {
      push(indent, "loop");
      lastStep = -1;
      continue;
    }
    if ((m = t.match(/^merge:\s*(.+?)\s*;\s*$/i))) {
      push(indent, `[goto: ${m[1].trim()}]`);
      lastStep = -1;
      continue;
    }
    if ((m = t.match(/^\[merge\s*:\s*([^\]]+)\]\s*;?\s*$/i))) {
      push(indent, `[goto: ${m[1].trim()}]`);
      lastStep = -1;
      continue;
    }
    // A bare `merge;` / `[merge]` — in a case or as a landing marker — names
    // no target; left as-is for the reader to error on (see the note above).
    if (/^\[\s*goto\s*:/i.test(t)) {
      // Already the current grammar's own bracket statement, not a step —
      // left untouched, and not tracked as the step a property line follows.
      out.push(line);
      lastStep = -1;
      continue;
    }
    if ((m = t.match(/^section-start\s*(\(.*)$/i))) {
      frames.push("section");
      push(indent, `section ${m[1]}`);
      lastStep = -1;
      continue;
    }
    if (/^start-point\s*$/i.test(t)) {
      frames.push("section");
      push(indent, "section");
      lastStep = -1;
      continue;
    }
    if (/^section\b/i.test(t) || /^branch\b/i.test(t)) {
      frames.push(/^section/i.test(t) ? "section" : "branch");
      out.push(line);
      lastStep = -1;
      continue;
    }
    if (/^end-(section|branch)\s*$/i.test(t)) {
      popTo(["section", "branch"]);
      out.push(line);
      lastStep = -1;
      continue;
    }
    if (/^end-point\s*$/i.test(t)) {
      const kind = popTo(["section", "branch"]) ?? "section";
      push(indent, `end-${kind}`);
      lastStep = -1;
      continue;
    }
    if (/^:\s*;?\s*$/.test(t)) {
      push(indent, "[]");
      lastStep = -1;
      continue;
    }
    if (/^\[.*\]/.test(t)) {
      // A step: `[role: text] <block>` with an optional trailing `;`.
      const cleaned = t.replace(/\s*;\s*$/, "");
      if (cleaned !== t) changed++;
      out.push(indent + cleaned);
      lastStep = out.length - 1;
      continue;
    }
    if ((m = t.match(/^props:\s*(.+?)\s*;\s*$/i))) {
      const ids = m[1]
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (suffix(ids.map((id) => `+${id}`).join(" "))) continue;
    }
    if ((m = t.match(/^arrow:\s*([a-z-]+)\s*;\s*$/i))) {
      const glyph = ARROW_GLYPH[m[1].toLowerCase()];
      if (!glyph || suffix(glyph)) {
        if (!glyph) changed++;
        continue;
      }
    }
    if ((m = t.match(/^link:\s*(\S+?)\s*;\s*$/i)) && suffix(`=> ${m[1]}`)) continue;
    out.push(line);
  }
  return { text: out.join("\n"), changed };
}

/** The earlier name, kept for callers that only knew about spellings. */
export const migrateLegacySpellings = migrateLegacyDsl;
