/**
 * Rewrite the spellings the version 1 grammar no longer has.
 *
 * The reader refuses `endif`, `endfork`, `elseif`, `section-start`,
 * `start-point` and `end-point` outright — one spelling per construct, no
 * compatibility layer — so a repository written before the change fails on
 * every file. This is the one-shot rewrite that brings a document across:
 * line-based, touching nothing but those keywords, and leaving fenced
 * values (`desc: ``` … ``` `) alone.
 *
 * `end-point` closed whichever group was open, so it becomes `end-branch`
 * inside a `branch` and `end-section` otherwise.
 */
export function migrateLegacySpellings(text) {
  const lines = String(text ?? "").split("\n");
  const groups = [];
  let inFence = false;
  let changed = 0;
  const out = lines.map((line) => {
    const t = line.trim();
    if (inFence) {
      if (/^```;?\s*$/.test(t)) inFence = false;
      return line;
    }
    if (/^[A-Za-z][A-Za-z-]*:\s*```\s*$/.test(t)) {
      inFence = true;
      return line;
    }
    const indent = line.match(/^\s*/)[0];
    const rewrite = (next) => {
      changed++;
      return indent + next;
    };
    let m;
    if (/^endif\s*;?\s*$/i.test(t)) return rewrite("end-if");
    if (/^endfork\s*;?\s*$/i.test(t)) return rewrite("end-fork");
    if ((m = t.match(/^elseif\b(.*)$/i))) return rewrite(`else-if${m[1]}`);
    if ((m = t.match(/^section-start\s*(\(.*)$/i))) {
      groups.push("section");
      return rewrite(`section ${m[1]}`);
    }
    if (/^start-point\s*$/i.test(t)) {
      groups.push("section");
      return rewrite("section");
    }
    if (/^section\b/i.test(t)) groups.push("section");
    else if (/^branch\b/i.test(t)) groups.push("branch");
    else if (/^end-(section|branch)\s*$/i.test(t)) groups.pop();
    else if (/^end-point\s*$/i.test(t)) {
      const kind = groups.pop() ?? "section";
      return rewrite(`end-${kind}`);
    }
    return line;
  });
  return { text: out.join("\n"), changed };
}
