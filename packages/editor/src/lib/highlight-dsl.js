/**
 * Tiny, dependency-free tokenizer for swimlane DSL syntax highlighting. It is
 * line-oriented (the DSL is one construct per line) and deliberately forgiving:
 * it never throws and the concatenation of a line's token texts always equals
 * the original line, so a highlighted overlay stays pixel-aligned with the
 * textarea behind it.
 *
 * Token types -> CSS class `sw-syn-<type>`:
 *   comment | meta | section | keyword | key | ref | anchor | punct | plain
 */

// Control-flow keywords (dsl-rule.md's closed keyword table). Longer forms
// first so e.g. "end-section" wins over "section" and "else-if" over "if".
// Matched at a word boundary, case-insensitive.
//
// `is` and `than` are the two halves of an `if`'s fused first clause
// (`if (q) is (a) than`); `else-if … than` spells every later clause. `case`
// is now a fork's non-first path only — it means nothing for an `if` any
// more — and the old `and` path spelling is gone entirely.
const KEYWORDS = [
  "end-section",
  "end-branch",
  "end-phase",
  "end-fork",
  "else-if",
  "end-if",
  "section",
  "branch",
  "phase",
  "fork",
  "loop",
  "case",
  "than",
  "if",
  "is",
];
const KW_RE = new RegExp(`^(?:${KEYWORDS.join("|")})\\b`, "i");
const SECTION_RE = /^\/(?:page|title|role|option|block|prop|line)\/\s*$/i;

/** Tokenize one line into `{ t, s }` tokens (t = type, s = source text). */
export function tokenizeDslLine(line) {
  const tokens = [];
  const lead = /^\s+/.exec(line);
  let body = line;
  if (lead) {
    tokens.push({ t: "plain", s: lead[0] });
    body = line.slice(lead[0].length);
  }
  if (body === "") return tokens;

  // Whole-line forms.
  if (body.startsWith("//") || body.startsWith("***")) {
    tokens.push({ t: "comment", s: body });
    return tokens;
  }
  if (body.startsWith("@")) {
    tokens.push({ t: "meta", s: body });
    return tokens;
  }
  if (SECTION_RE.test(body)) {
    tokens.push({ t: "section", s: body });
    return tokens;
  }

  // Control-flow lines start with a keyword; only then do we colour an inline
  // keyword like `than` (avoids highlighting it inside step text, e.g.
  // "review and approve"). Even on a control line, text inside `(…)` is the
  // author's own condition or case label — `if (Is the form signed?) is (yes)
  // than` must not light up the `Is` the user typed — so keyword matching is
  // suppressed while the paren depth is non-zero. `readText` in the parser
  // nests parens the same way.
  const inControl = KW_RE.test(body);
  let atStart = true;
  let parens = 0;
  let pos = 0;
  while (pos < body.length) {
    const rest = body.slice(pos);
    const inText = parens > 0;
    let m;
    if ((m = /^<[^>]*>/.exec(rest))) tokens.push({ t: "ref", s: m[0] });
    else if ((m = /^#[A-Za-z0-9_-]+/.exec(rest))) tokens.push({ t: "anchor", s: m[0] });
    // The bare spacer statement — a step-shaped line with nothing in it.
    else if ((m = /^\[\]/.exec(rest))) tokens.push({ t: "keyword", s: m[0] });
    // `[goto: id]` is a jump statement, not a step whose role is "goto" — so
    // colour the word as control flow even though `goto` is no longer a
    // keyword anywhere else (there is no bare `goto` line any more).
    else if (atStart && (m = /^(\[\s*)(goto)(?=\s*:)/i.exec(rest))) {
      tokens.push({ t: "plain", s: m[1] });
      tokens.push({ t: "keyword", s: m[2] });
    } else if (
      atStart &&
      (m = /^[A-Za-z][A-Za-z0-9_-]*(?=\s*[:;])/.exec(rest)) &&
      !KEYWORDS.includes(m[0].toLowerCase())
    )
      tokens.push({ t: "key", s: m[0] });
    else if (!inText && (atStart || inControl) && (m = KW_RE.exec(rest)))
      tokens.push({ t: "keyword", s: m[0] });
    else if ((m = /^[;:(){}]/.exec(rest))) tokens.push({ t: "punct", s: m[0] });
    else if ((m = /^\s+/.exec(rest))) tokens.push({ t: "plain", s: m[0] });
    else {
      // Plain run up to the next significant char (never drop a character).
      m = /^[^\s<>#;:(){}[\]]+/.exec(rest) || [rest[0]];
      tokens.push({ t: "plain", s: m[0] });
    }
    // Track paren depth across whatever this token swallowed — a fullwidth
    // `（` can arrive inside a plain run, so counting characters is safer
    // than relying on the punct branch alone.
    for (const ch of m[0]) {
      if (ch === "(" || ch === "（") parens++;
      else if (ch === ")" || ch === "）") parens = Math.max(0, parens - 1);
    }
    pos += m[0].length;
    atStart = false;
  }
  return tokens;
}
