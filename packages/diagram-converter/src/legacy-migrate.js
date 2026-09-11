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
 * - `if (q) is (a) than #c` → `if (q) #c` + `case (a)`; `else-if (b) than` →
 *   `case (b)`; `else` → `case ()`; the un-hyphenated closers → `end-if` …
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

  for (const line of lines) {
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
    if ((m = t.match(/^if\s*\((.+?)\)\s*is\s*\((.+?)\)\s*than(?:\s+#([A-Za-z]+))?\s*$/i))) {
      frames.push("if");
      push(indent, `if (${m[1].trim()})${color(m[3])}`);
      out.push(`${indent}case (${m[2].trim()})`);
      lastStep = -1;
      continue;
    }
    if ((m = t.match(/^else-?if\s*\((.+?)\)\s*than(?:\s+#([A-Za-z]+))?\s*$/i))) {
      push(indent, `case (${m[1].trim()})${color(m[2])}`);
      lastStep = -1;
      continue;
    }
    if ((m = t.match(/^else(?:\s+than)?(?:\s+#([A-Za-z]+))?\s*$/i))) {
      push(indent, `case ()${color(m[1])}`);
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
