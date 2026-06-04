export function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/**
 * Truncate `text` so its rendered width stays within `maxCols` display columns
 * (see charDisplayColumnWidth, where 1 column ≈ one full-width CJK cell),
 * appending an ellipsis when cut. Unlike truncate(), which counts raw character
 * count, this respects actual mixed-script widths so CJK/wide text doesn't
 * overflow its container.
 */
export function truncateToColumns(text, maxCols) {
  const s = text || "";
  if (maxCols <= 0) return "";
  let total = 0;
  for (const ch of s) total += charDisplayColumnWidth(ch);
  if (total <= maxCols) return s;
  const budget = Math.max(0, maxCols - 1); // reserve ~1 column for the ellipsis
  let acc = 0;
  let out = "";
  for (const ch of s) {
    const w = charDisplayColumnWidth(ch);
    if (acc + w > budget) break;
    acc += w;
    out += ch;
  }
  return out + "…";
}

function isFullWidthCodePoint(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals · Kangxi · CJK symbols
    (cp >= 0x3041 && cp <= 0x33ff) || // Hiragana · Katakana · CJK symbols/punct
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
    (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compatibility forms
    (cp >= 0xff00 && cp <= 0xff60) || // Full-width ASCII variants
    (cp >= 0xffe0 && cp <= 0xffe6) || // Full-width signs
    (cp >= 0x1f300 && cp <= 0x1faff) || // Emoji / pictographs (full-width)
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK Ext B and beyond
  );
}

// Proportional ASCII glyphs whose width is far from the 0.5em average.
const NARROW_CHARS = new Set([..."iIljftr.,:;'`!|()[]{}/\\ -"]);
const WIDE_CHARS = new Set([..."mwMW@%"]);

/**
 * Approximate the rendered width of a single character in "columns", where one
 * column is one full-width CJK cell (1em). Lets wrapping respect the actual
 * mixed-script width of a line rather than a flat ASCII-vs-CJK split: ASCII,
 * Latin-1, Greek, Cyrillic, etc. are proportional half-width, and only true
 * East-Asian / emoji glyphs occupy a full column.
 */
export function charDisplayColumnWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp == null) return 0;
  if (isFullWidthCodePoint(cp)) return 1;
  if (NARROW_CHARS.has(ch)) return 0.3;
  if (WIDE_CHARS.has(ch)) return 0.78;
  return 0.5; // ASCII default and other proportional half-width scripts
}

export function stringDisplayColumnWidth(s) {
  if (!s) return 0;
  let w = 0;
  for (const ch of s) w += charDisplayColumnWidth(ch);
  return w;
}

/**
 * Wrap plain text so each line fits within `maxCols` East Asian "full-width" columns.
 * Respects existing newlines as paragraph breaks.
 */
export function wrapTextToDisplayColumns(text, maxCols = 28) {
  if (!text) return [];
  const lines = [];
  for (const segment of text.split(/\r?\n/)) {
    let line = "";
    let cols = 0;
    for (const ch of segment) {
      const w = charDisplayColumnWidth(ch);
      if (cols + w > maxCols && line.length > 0) {
        lines.push(line);
        line = "";
        cols = 0;
      }
      line += ch;
      cols += w;
    }
    if (line.length > 0) lines.push(line);
  }
  return lines;
}

/** @typedef {{ text: string, bold?: boolean, italic?: boolean, strike?: boolean }} DescriptionStyledRun */

function mergeAdjacentRuns(runs) {
  /** @type {DescriptionStyledRun[]} */
  const out = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (
      last &&
      !!last.bold === !!r.bold &&
      !!last.italic === !!r.italic &&
      !!last.strike === !!r.strike
    ) {
      last.text += r.text;
    } else {
      out.push({ text: r.text, bold: r.bold, italic: r.italic, strike: r.strike });
    }
  }
  return out;
}

/**
 * Parses description inline markup. Escaped `\\` drops the backslash and the next character is literal.
 * Supports `***` bold+italic, `**` bold, `*` italic, `~~` strikethrough (toggle semantics).
 */
export function parseDescriptionInline(str) {
  let bold = false;
  let italic = false;
  let strike = false;
  let buf = "";
  /** @type {DescriptionStyledRun[]} */
  const runs = [];
  function flush() {
    if (buf) {
      runs.push({
        text: buf,
        bold: bold || undefined,
        italic: italic || undefined,
        strike: strike || undefined,
      });
      buf = "";
    }
  }
  let i = 0;
  while (i < str.length) {
    const c = str[i];
    if (c === "\\") {
      if (i + 1 < str.length) {
        buf += str[i + 1];
        i += 2;
        continue;
      }
      buf += c;
      i += 1;
      continue;
    }
    if (str.slice(i, i + 3) === "***") {
      flush();
      bold = !bold;
      italic = !italic;
      i += 3;
      continue;
    }
    if (str.slice(i, i + 2) === "**") {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }
    if (c === "*") {
      flush();
      italic = !italic;
      i += 1;
      continue;
    }
    if (str.slice(i, i + 2) === "~~") {
      flush();
      strike = !strike;
      i += 2;
      continue;
    }
    buf += c;
    i += 1;
  }
  flush();
  return mergeAdjacentRuns(runs);
}

function flattenRunsToChars(runs) {
  /** @type {{ ch: string, bold: boolean, italic: boolean, strike: boolean }[]} */
  const out = [];
  for (const r of runs) {
    for (const ch of r.text) {
      out.push({
        ch,
        bold: !!r.bold,
        italic: !!r.italic,
        strike: !!r.strike,
      });
    }
  }
  return out;
}

function mergeCharLineToRuns(chars) {
  if (chars.length === 0) {
    return [{ text: "\u00a0", bold: false, italic: false, strike: false }];
  }
  /** @type {DescriptionStyledRun[]} */
  const runs = [];
  let cur = {
    text: chars[0].ch,
    bold: chars[0].bold,
    italic: chars[0].italic,
    strike: chars[0].strike,
  };
  for (let k = 1; k < chars.length; k++) {
    const c = chars[k];
    if (
      c.bold === cur.bold &&
      c.italic === cur.italic &&
      c.strike === cur.strike
    ) {
      cur.text += c.ch;
    } else {
      runs.push({
        text: cur.text,
        bold: cur.bold || undefined,
        italic: cur.italic || undefined,
        strike: cur.strike || undefined,
      });
      cur = {
        text: c.ch,
        bold: c.bold,
        italic: c.italic,
        strike: c.strike,
      };
    }
  }
  runs.push({
    text: cur.text,
    bold: cur.bold || undefined,
    italic: cur.italic || undefined,
    strike: cur.strike || undefined,
  });
  return runs;
}

function continuationIndentChars(indentCols) {
  /** @type {{ ch: string, bold: boolean, italic: boolean, strike: boolean }[]} */
  const arr = [];
  let acc = 0;
  while (acc + 0.5 <= indentCols + 1e-9) {
    arr.push({ ch: " ", bold: false, italic: false, strike: false });
    acc += 0.5;
  }
  return arr;
}

function wrapFlatCharsToVisualLines(flat, maxCols, continuationIndentCols) {
  const safeIndent = Math.min(
    continuationIndentCols,
    Math.max(0, maxCols - 0.5)
  );
  if (flat.length === 0) {
    return [[{ text: "\u00a0", bold: false, italic: false, strike: false }]];
  }
  /** @type {{ ch: string, bold: boolean, italic: boolean, strike: boolean }[][]} */
  const lines = [];
  /** @type {{ ch: string, bold: boolean, italic: boolean, strike: boolean }[]} */
  let line = [];
  let cols = 0;

  function pushLine() {
    lines.push(mergeCharLineToRuns(line));
    line = [...continuationIndentChars(safeIndent)];
    cols = safeIndent;
  }

  for (const item of flat) {
    const w = charDisplayColumnWidth(item.ch);
    if (cols + w > maxCols && line.length > 0) pushLine();
    line.push(item);
    cols += w;
  }
  if (line.length > 0) lines.push(mergeCharLineToRuns(line));
  return lines;
}

/**
 * Split a physical line into optional list prefix + remainder for inline parse.
 * `- item`, `1. item` (number + dot + space).
 */
export function splitDescriptionListLine(physicalLine) {
  const num = physicalLine.match(/^(\d+)\.\s+(.*)$/);
  if (num) {
    const prefix = `${num[1]}. `;
    return { prefix, rest: num[2] };
  }
  const bullet = physicalLine.match(/^-\s+(.*)$/);
  if (bullet) {
    return { prefix: "- ", rest: bullet[1] };
  }
  return { prefix: "", rest: physicalLine };
}

/**
 * Full description → visual lines for SVG (28 columns), with styles and list prefixes.
 * @returns {DescriptionStyledRun[][]}
 */
export function wrapDescriptionToVisualLines(description, maxCols = 28) {
  const trimmed = (description || "").trim();
  if (!trimmed) return [];
  /** @type {DescriptionStyledRun[][]} */
  const allLines = [];
  const physical = trimmed.split(/\r?\n/);
  for (let pi = 0; pi < physical.length; pi++) {
    const segment = physical[pi];
    if (segment.length === 0) {
      allLines.push([
        { text: "\u00a0", bold: false, italic: false, strike: false },
      ]);
      continue;
    }
    const { prefix, rest } = splitDescriptionListLine(segment);
    const prefixRuns = prefix
      ? [{ text: prefix, bold: false, italic: false, strike: false }]
      : [];
    const inlineRuns = parseDescriptionInline(rest);
    const combined = mergeAdjacentRuns([...prefixRuns, ...inlineRuns]);
    const flat = flattenRunsToChars(combined);
    const contIndent = stringDisplayColumnWidth(prefix);
    const visual = wrapFlatCharsToVisualLines(flat, maxCols, contIndent);
    for (const vl of visual) allLines.push(vl);
  }
  return allLines;
}

export function parseHelpMd(md) {
  const sections = [];
  for (const block of md.split(/^## /m).filter(Boolean)) {
    const lines = block.split(/\r?\n/);
    const title = lines[0].trim();
    const body = lines.slice(1).join("\n");
    const codeMatch = body.match(/```\n?([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].replace(/\n$/, "") : "";
    const desc = body.replace(/```[\s\S]*?```/, "").trim();
    sections.push({ title, code, desc });
  }
  return sections;
}

const TEMPLATE_FENCE_RE = /```(kai-swimlane-parts|kai-swimlane)?\n?([\s\S]*?)```/;

function extractTemplateFence(body) {
  const match = body.match(TEMPLATE_FENCE_RE);
  if (!match) return { lang: null, code: "" };
  const lang = match[1] || null;
  const code = match[2].replace(/\n$/, "");
  let preview = null;
  if (lang === "kai-swimlane") preview = "full";
  else if (lang === "kai-swimlane-parts") preview = "parts";
  return { lang, code, preview };
}

export function parseTemplateMd(md) {
  const categories = [];
  for (const block of md.split(/^## /m).filter(Boolean)) {
    const lines = block.split(/\r?\n/);
    const id = lines[0].trim().toLowerCase();
    const body = lines.slice(1).join("\n");
    const h3Idx = body.search(/^### /m);
    const intro = h3Idx >= 0 ? body.slice(0, h3Idx).trim() : "";
    const itemsBody = h3Idx >= 0 ? body.slice(h3Idx) : body;
    const items = [];
    const parts = itemsBody.split(/^### /m).filter((p) => p.trim());
    parts.forEach((part, index) => {
      const partLines = part.split(/\r?\n/);
      const title = partLines[0].trim();
      const partBody = partLines.slice(1).join("\n");
      const { lang, code, preview } = extractTemplateFence(partBody);
      if (!title || !code) return;
      const desc = partBody.replace(TEMPLATE_FENCE_RE, "").trim();
      items.push({
        id: `${id}-${index}`,
        title,
        desc,
        code,
        lang,
        preview,
      });
    });
    categories.push({ id, intro, items });
  }
  return categories;
}
