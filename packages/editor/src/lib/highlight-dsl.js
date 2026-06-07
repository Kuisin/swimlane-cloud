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

// Control-flow keywords. Longer forms first so e.g. "section-start" wins over
// "section". Matched at a word boundary, case-insensitive.
const KEYWORDS = [
  "section-start",
  "start-point",
  "end-section",
  "end-point",
  "end-branch",
  "elseif",
  "endfork",
  "endif",
  "section",
  "branch",
  "fork",
  "loop",
  "skip",
  "merge",
  "else",
  "than",
  "and",
  "is",
  "if",
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

  // Control-flow lines start with a keyword; only then do we colour inline
  // keywords like `is` / `than` (avoids highlighting them inside step text).
  const inControl = KW_RE.test(body);
  let atStart = true;
  let pos = 0;
  while (pos < body.length) {
    const rest = body.slice(pos);
    let m;
    if ((m = /^<[^>]*>/.exec(rest))) tokens.push({ t: "ref", s: m[0] });
    else if ((m = /^#[A-Za-z0-9_-]+/.exec(rest))) tokens.push({ t: "anchor", s: m[0] });
    else if ((m = /^\[[A-Za-z][A-Za-z-]*\]/.exec(rest))) tokens.push({ t: "keyword", s: m[0] });
    else if (atStart && (m = /^[A-Za-z][A-Za-z0-9_-]*(?=\s*:)/.exec(rest)))
      tokens.push({ t: "key", s: m[0] });
    else if ((atStart || inControl) && (m = KW_RE.exec(rest)))
      tokens.push({ t: "keyword", s: m[0] });
    else if ((m = /^[;:(){}]/.exec(rest))) tokens.push({ t: "punct", s: m[0] });
    else if ((m = /^\s+/.exec(rest))) tokens.push({ t: "plain", s: m[0] });
    else {
      // Plain run up to the next significant char (never drop a character).
      m = /^[^\s<>#;:(){}[\]]+/.exec(rest) || [rest[0]];
      tokens.push({ t: "plain", s: m[0] });
    }
    pos += m[0].length;
    atStart = false;
  }
  return tokens;
}
