/**
 * Reader for `kai-swimlane 2` — the DSL specified in dsl-rule.md.
 *
 * Version 2 is whitespace-insensitive: `;` terminates properties, directives and
 * the `/title/` payload, and every other statement self-delimits, so a file can
 * be squashed to one line and still parse. This module scans statements rather
 * than lines and produces the same model `parseDSL` returns, so the renderer,
 * the mobile view and the editor need no change.
 *
 * What it does not do yet: `@use` is recorded and reported, never fetched — the
 * host resolves imports and passes them in via `options.resolveImport`.
 */
import { BLOCK_SHAPE_WIDTH_FACTOR, BRANCH_COLOR_STYLES } from "./render-pure/diagram-layout.js";
import { normalizeArrowLine } from "./arrow-line.js";
import {
  DIAGRAM_OPTION_DSL_MAP,
  OPTION_COLUMN_TITLE_DSL_MAP,
  DEFAULT_COLUMN_TITLES,
  emptyDiagramOptions,
} from "./diagram-options.js";

export const V2_HEADER_RE = /^\uFEFF?[ \t]*@kai-swimlane(?:[ \t]+([0-9]+(?:\.[0-9]+)?))?/;

/** The header version of `src`, or null when it carries no header at all. */
export function dslVersion(src) {
  const probe = String(src ?? "")
    .split(/\r?\n/)
    .find((l) => l.trim() !== "");
  if (probe === undefined) return null;
  const m = V2_HEADER_RE.exec(probe);
  if (!m) return null;
  return m[1] ? Math.trunc(Number(m[1])) : 1;
}

const SECTIONS = ["meta", "title", "page", "option", "role", "block", "prop", "line", "i18n"];
const GLYPHS = [
  ["-->", "long-dash"],
  ["-.>", "dash-dot"],
  ["..>", "dotted"],
  ["~>", "dashed"],
  ["->", "solid"],
];
const OPENERS = ["if", "fork", "section", "branch", "phase"];
const CLOSERS = {
  "end-if": "if",
  "end-fork": "fork",
  "end-section": "section",
  "end-branch": "branch",
  "end-phase": "phase",
};
const BOOLS = { true: true, false: false };

const PAGE_MAP = {
  description: "description",
  "left-title": "leftTitle",
  "left-subtitle": "leftSubtitle",
  "right-title": "rightTitle",
  "right-subtitle": "rightSubtitle",
  "header-left": "headerLeft",
  "header-center": "headerCenter",
  "header-right": "headerRight",
  "footer-left": "footerLeft",
  "footer-center": "footerCenter",
  "footer-right": "footerRight",
};
const ROLE_MAP = {
  label: "label",
  "text-color": "textColor",
  "background-color": "bg",
  icon: "icon",
};
const BLOCK_MAP = {
  "background-color": "bg",
  "text-color": "textColor",
  "border-color": "borderColor",
  shape: "shape",
  icon: "icon",
  label: "label",
};
const PROP_MAP = {
  label: "label",
  side: "side",
  "background-color": "bg",
  "border-color": "borderColor",
  "text-color": "textColor",
  title: "title",
  hint: "title",
  "max-chars": "maxChars",
};

/** Structural whitespace: the six code points the spec names. */
function isWs(c) {
  return c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\u00a0" || c === "\u3000";
}
function isIdChar(c) {
  if (!c) return false;
  return /[\p{L}\p{N}_]/u.test(c);
}

/**
 * A scanner over the diagram body. Statement-oriented: `line` is derived from
 * the offset only so diagnostics can point somewhere in an expanded file.
 */
class Scanner {
  constructor(src, offset) {
    this.s = src;
    this.i = 0;
    this.base = offset;
  }
  get eof() {
    return this.i >= this.s.length;
  }
  lineAt(pos) {
    let n = 1 + this.base;
    for (let k = 0; k < pos && k < this.s.length; k++) if (this.s[k] === "\n") n++;
    return n;
  }
  /** Skip whitespace; returns true when it crossed a newline. */
  skipWs() {
    let nl = false;
    while (!this.eof && isWs(this.s[this.i])) {
      if (this.s[this.i] === "\n") nl = true;
      this.i++;
    }
    return nl;
  }
  atLineStart() {
    for (let k = this.i - 1; k >= 0; k--) {
      if (this.s[k] === "\n") return true;
      if (!isWs(this.s[k])) return false;
    }
    return true;
  }
  /** A comment at the cursor, or null. `//` only opens one at a line start. */
  comment() {
    if (this.s.startsWith("//", this.i) && this.atLineStart()) {
      const end = this.s.indexOf("\n", this.i);
      const text = this.s.slice(this.i + 2, end < 0 ? this.s.length : end).trim();
      this.i = end < 0 ? this.s.length : end;
      return text;
    }
    if (this.s.startsWith("/*", this.i)) {
      const end = this.s.indexOf("*/", this.i + 2);
      const text = this.s.slice(this.i + 2, end < 0 ? this.s.length : end).trim();
      this.i = end < 0 ? this.s.length : end + 2;
      return text;
    }
    return null;
  }
  /** The maximal word at the cursor (id characters and interior hyphens). */
  word() {
    const start = this.i;
    while (!this.eof) {
      const c = this.s[this.i];
      if (isIdChar(c)) this.i++;
      else if (c === "-" && isIdChar(this.s[this.i + 1])) this.i++;
      else break;
    }
    return this.s.slice(start, this.i);
  }
  peek(str) {
    return this.s.startsWith(str, this.i);
  }
  /** A section marker at the cursor (`/line/`), or null. */
  marker() {
    if (this.s[this.i] !== "/") return null;
    const m = /^\/([a-z0-9-]+)\//.exec(this.s.slice(this.i));
    if (!m) return null;
    this.i += m[0].length;
    return m[1];
  }
}

/**
 * Read one run: a quoted string, or bare text to the first unescaped member of
 * `stops`. Depth is counted for the bracket pair `depth` names, so
 * `[sales: 予算[確定] を承認]` needs no escape.
 */
function readRun(sc, stops, depth, splitBars = false) {
  sc.skipWs();
  const out = [];
  if (sc.s[sc.i] === '"') {
    const save = sc.i;
    sc.i++;
    let ok = false;
    while (!sc.eof) {
      const c = sc.s[sc.i];
      if (c === "\\") {
        out.push(unescapeChar(sc.s[sc.i + 1], sc.s[sc.i]));
        sc.i += 2;
        continue;
      }
      if (c === "\n" || c === "\r") break;
      if (c === '"') {
        sc.i++;
        ok = true;
        break;
      }
      out.push(c);
      sc.i++;
    }
    if (ok) {
      const after = sc.i;
      sc.skipWs();
      if (sc.eof || stops.includes(sc.s[sc.i])) return out.join("");
      sc.i = after;
      return out.join("");
    }
    sc.i = save;
    out.length = 0;
  }
  let level = 0;
  const open = depth?.[0];
  const close = depth?.[1];
  while (!sc.eof) {
    const c = sc.s[sc.i];
    if (c === "\\") {
      out.push(unescapeChar(sc.s[sc.i + 1], c));
      sc.i += 2;
      continue;
    }
    if (splitBars && level === 0 && (c === "|" || c === "｜")) {
      out.push("\u0000");
      sc.i++;
      continue;
    }
    if (open && c === open) level++;
    if (close && c === close && level > 0) level--;
    else if (stops.includes(c) && level === 0) break;
    out.push(c);
    sc.i++;
  }
  return out.join("").trim();
}

const ESCAPES = { n: "\n", t: "\t" };
function unescapeChar(next, backslash) {
  if (next === undefined) return backslash;
  if (ESCAPES[next]) return ESCAPES[next];
  if ('\\";|｜][)(（）/'.includes(next)) return next;
  return backslash + next;
}

/** Split a translatable run on unescaped bars and pick the render language. */
function pickSegment(raw, langIndex) {
  if (!raw.includes("\u0000")) return raw;
  const parts = raw.split("\u0000");
  return (parts[langIndex] || "").trim() || parts[0].trim();
}

/** Read a run, marking unescaped separators so `pickSegment` can split later. */
function readText(sc, stops, depth) {
  return readRun(sc, stops, depth, true);
}

/**
 * Parse a `kai-swimlane 2` document into the model `parseDSL` returns.
 *
 * @param {string} src
 * @param {{ resolveImport?: (path: string) => string | null, lang?: string }} [options]
 */
export function parseDSLv2(src, options = {}) {
  const errors = [];
  const raw = String(src ?? "");
  const lines = raw.split(/\r?\n/);
  const headerLine = lines.findIndex((l) => V2_HEADER_RE.test(l));
  const m = headerLine < 0 ? null : V2_HEADER_RE.exec(lines[headerLine]);
  if (!m) {
    return emptyModel([{ line: 1, text: "", msg: "@kai-swimlane marker not found" }]);
  }
  const headerStart = raw.indexOf(m[0]);
  const body = raw.slice(headerStart + m[0].length);
  const sc = new Scanner(body, headerLine);

  const page = emptyPage();
  const options_ = emptyDiagramOptions();
  const providedColumnTitles = new Set();
  const providedPageKeys = new Set();
  const roles = {};
  const blocks = {};
  const props = {};
  const meta = {};
  const catalog = {};
  const uses = [];
  const rows = [];
  let title = "";
  let langs = Array.isArray(options.languages) ? [...options.languages] : [];
  let langIndex =
    langs.length && options.lang && langs.includes(options.lang) ? langs.indexOf(options.lang) : 0;

  const stack = [];
  const groupStack = [];
  let branchCounter = 0;
  let groupCounter = 0;
  let lastStep = -1;
  let lastStatement = -1;
  let pendingComments = [];
  const stepIds = new Map();
  const jumps = [];

  const branchMarkerDepth = () => (stack.length ? stack[stack.length - 1].depth + 1 : 0);
  const branchControlDepth = () => (stack.length ? stack[stack.length - 1].depth : 0);
  const branchBodyDepth = () => (stack.length ? stack[stack.length - 1].depth + 1 : 0);
  const groupMarkerDepth = () =>
    groupStack.length ? groupStack[groupStack.length - 1].depth + 1 : branchBodyDepth();
  const stepDepth = () =>
    groupStack.length ? groupStack[groupStack.length - 1].depth + 1 : branchBodyDepth();

  const err = (pos, msg, text = "") => errors.push({ line: sc.lineAt(pos), text, msg });
  const push = (fields, pos) => {
    const row = { ...fields, dslLines: [sc.lineAt(pos)] };
    if (pendingComments.length) {
      row.leadingComments = pendingComments;
      pendingComments = [];
    }
    rows.push(row);
    lastStatement = rows.length - 1;
    return lastStatement;
  };
  const seg = (t) => pickSegment(t, langIndex);
  const checkColor = (token, pos) => {
    if (token && !BRANCH_COLOR_STYLES[token] && !/^[0-9a-f]{3,8}$/i.test(token)) {
      err(
        pos,
        `unknown color "#${token}" — use one of ${Object.keys(BRANCH_COLOR_STYLES).join(", ")}`,
      );
    }
  };

  /** `#color` / `@id` / `[lane]` after a control keyword, in either order. */
  function readOpenerSuffixes(pos) {
    const out = { color: null, id: null };
    for (;;) {
      sc.skipWs();
      if (sc.peek("#")) {
        sc.i++;
        const token = sc.word().toLowerCase();
        checkColor(token, pos);
        out.color = token;
        continue;
      }
      if (sc.peek("@")) {
        const save = sc.i;
        sc.i++;
        const w = sc.word();
        if (["end", "use", "lang", "kai-swimlane"].includes(w)) {
          sc.i = save;
          break;
        }
        out.id = w;
        continue;
      }
      break;
    }
    return out;
  }

  /** A `key: value;`, `key;` flag or `unset: a, b;` at the cursor, or null. */
  function readProperty() {
    const save = sc.i;
    sc.skipWs();
    const pos = sc.i;
    let key;
    if (sc.s[sc.i] === '"') {
      sc.i++;
      key = '"' + readRun(sc, ['"'], null) + '"';
      if (sc.s[sc.i] === '"') sc.i++;
    } else {
      key = sc.word();
      // A structured /i18n/ key addresses a node field: `quote.remark.en`.
      while (sc.s[sc.i] === "." && isIdChar(sc.s[sc.i + 1])) {
        const mark = sc.i;
        sc.i++;
        const part = sc.word();
        let ahead = sc.i;
        while (ahead < sc.s.length && isWs(sc.s[ahead])) ahead++;
        if (sc.s[ahead] === "." || sc.s[ahead] === ":" || sc.s[ahead] === "：") {
          if (sc.s[ahead] === ".") {
            key += "." + part;
            continue;
          }
          sc.i = mark;
          break;
        }
        sc.i = mark;
        break;
      }
    }
    if (!key) {
      sc.i = save;
      return null;
    }
    sc.skipWs();
    let tag = null;
    if (sc.s[sc.i] === ".") {
      sc.i++;
      tag = sc.word();
      sc.skipWs();
    }
    if (sc.s[sc.i] === ";") {
      sc.i++;
      return { key, tag, value: "true", flag: true, pos };
    }
    if (sc.s[sc.i] !== ":" && sc.s[sc.i] !== "：") {
      sc.i = save;
      return null;
    }
    sc.i++;
    sc.skipWs();
    let value;
    if (sc.peek("```")) {
      sc.i += 3;
      const end = sc.s.indexOf("```", sc.i);
      const bodyText = sc.s.slice(sc.i, end < 0 ? sc.s.length : end);
      sc.i = end < 0 ? sc.s.length : end + 3;
      sc.skipWs();
      if (sc.s[sc.i] === ";") sc.i++;
      value = dedent(bodyText);
    } else {
      value = readText(sc, [";"], null);
      if (sc.s[sc.i] === ";") sc.i++;
      else err(pos, `"${key}" must end with ';'`);
    }
    return { key, tag, value, pos };
  }

  function dedent(text) {
    const lines = text
      .replace(/^\r?\n/, "")
      .replace(/\r?\n[ \t]*$/, "")
      .split(/\r?\n/);
    const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length);
    const cut = indents.length ? Math.min(...indents) : 0;
    return lines.map((l) => l.slice(cut)).join("\n");
  }

  /** Apply `key`/`key.tag` to a target, honouring the declared language order. */
  function applyLocalized(target, field, prop) {
    if (!prop.tag) {
      target[field] = seg(prop.value);
      if (langs.length) target[`${field}$src`] = prop.value;
      return;
    }
    const idx = langs.indexOf(prop.tag);
    if (idx < 0) {
      err(prop.pos, `unknown language "${prop.tag}" — not declared in @lang`);
      return;
    }
    if (idx === langIndex) target[field] = prop.value;
  }

  // ---------------------------------------------------------------- prologue
  for (;;) {
    sc.skipWs();
    const c = sc.comment();
    if (c !== null) continue;
    if (!sc.peek("@")) break;
    const pos = sc.i;
    sc.i++;
    const name = sc.word();
    if (name === "lang") {
      const list = readRun(sc, [";"], null);
      if (sc.s[sc.i] === ";") sc.i++;
      else err(pos, "@lang must end with ';'");
      langs = list
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const want = options.lang;
      langIndex = want && langs.includes(want) ? langs.indexOf(want) : 0;
      continue;
    }
    if (name === "use") {
      const path = readRun(sc, [";"], null);
      if (sc.s[sc.i] === ";") sc.i++;
      else err(pos, "@use must end with ';'");
      uses.push({ path, pos });
      continue;
    }
    if (name === "end") break;
    err(pos, `unknown directive "@${name}"`);
  }

  // Imports merge first so a local definition overrides them key by key.
  for (const use of uses) {
    const text = options.resolveImport ? options.resolveImport(use.path) : null;
    if (text == null) {
      errors.push({
        line: sc.lineAt(use.pos),
        text: `@use ${use.path};`,
        msg: `cannot resolve "${use.path}" — definitions fall back to theme defaults`,
        severity: "warning",
      });
      continue;
    }
    const frag = parseFragmentV2(text, { ...options, languages: langs, lang: langs[langIndex] });
    for (const field of frag.providedPageKeys ?? []) {
      page[field] = frag.page[field];
      providedPageKeys.add(field);
    }
    Object.assign(options_, frag.options);
    for (const k of frag.providedColumnTitles ?? []) providedColumnTitles.add(k);
    mergeDefs(roles, frag.roles);
    mergeDefs(blocks, frag.blocks);
    mergeDefs(props, frag.props);
    Object.assign(catalog, frag.catalog);
  }

  // ---------------------------------------------------------------- sections
  let section = null;
  let activeDef = null;
  while (!sc.eof) {
    sc.skipWs();
    if (sc.eof) break;
    const c = sc.comment();
    if (c !== null) {
      if (section === "line") pendingComments.push(`// ${c}`);
      continue;
    }
    const pos = sc.i;
    if (sc.peek("@")) {
      sc.i++;
      const name = sc.word();
      if (name === "end") break;
      if (name === "use" || name === "lang") {
        readRun(sc, [";"], null);
        if (sc.s[sc.i] === ";") sc.i++;
        err(pos, `@${name} must come before the first section`);
        continue;
      }
      err(pos, `unknown directive "@${name}"`);
      continue;
    }
    const marker = sc.marker();
    if (marker !== null) {
      if (!SECTIONS.includes(marker)) {
        err(pos, `unknown section "/${marker}/"`);
        section = null;
      } else {
        section = marker;
      }
      activeDef = null;
      continue;
    }

    if (section === "title") {
      const t = readText(sc, [";"], null);
      if (sc.s[sc.i] === ";") sc.i++;
      else err(pos, "/title/ value must end with ';'");
      title = seg(t);
      continue;
    }

    if (section === "role" || section === "block" || section === "prop") {
      if (sc.s[sc.i] === "<") {
        sc.i++;
        const id = readRun(sc, [">"], null);
        if (sc.s[sc.i] === ">") sc.i++;
        activeDef = id;
        const bag = section === "role" ? roles : section === "block" ? blocks : props;
        if (!bag[id]) {
          bag[id] = section === "prop" ? { id, label: id, side: "right" } : { id };
        }
        continue;
      }
      const prop = readProperty();
      if (!prop) {
        err(pos, `unrecognized /${section}/ statement`);
        sc.i = Math.max(sc.i + 1, pos + 1);
        continue;
      }
      if (!activeDef) {
        err(prop.pos, "property must follow a <id> definition");
        continue;
      }
      applyDefProp(section, activeDef, prop);
      continue;
    }

    if (section === "page" || section === "option" || section === "meta" || section === "i18n") {
      const prop = readProperty();
      if (!prop) {
        err(pos, `unrecognized /${section}/ statement`);
        sc.i = Math.max(sc.i + 1, pos + 1);
        continue;
      }
      if (section === "meta") {
        meta[prop.key] = prop.value;
      } else if (section === "i18n") {
        catalog[`${prop.key}${prop.tag ? "." + prop.tag : ""}`] = prop.value;
      } else if (section === "page") {
        const field = PAGE_MAP[prop.key];
        if (!field) err(prop.pos, `unknown /page/ key: ${prop.key}`);
        else {
          applyLocalized(page, field, prop);
          providedPageKeys.add(field);
          if (OPTION_COLUMN_TITLE_DSL_MAP[prop.key]) providedColumnTitles.add(field);
        }
      } else {
        applyOption(prop);
      }
      continue;
    }

    if (section === "line") {
      readFlowStatement(pos);
      continue;
    }

    // Content before any section marker.
    err(pos, "statement outside a section");
    sc.i = Math.max(sc.i + 1, pos + 1);
  }

  // ---------------------------------------------------------------- closing
  for (const open of groupStack) {
    errors.push({
      line: 0,
      text: "",
      msg: `unclosed ${open.groupMode} (missing end-${open.groupMode})`,
    });
  }
  for (const open of stack) {
    errors.push({
      line: 0,
      text: "",
      msg:
        open.type === "fork" ? "unclosed fork (missing end-fork)" : "unclosed if (missing end-if)",
    });
  }
  for (const j of jumps) {
    if (!stepIds.has(j.target)) {
      errors.push({ line: sc.lineAt(j.pos), text: "", msg: `no node with id "${j.target}"` });
    }
  }

  const seen = new Set();
  const ordered = [];
  for (const id of Object.keys(roles)) {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  for (const r of rows) {
    if (r.kind === "step" && r.role && !seen.has(r.role)) {
      seen.add(r.role);
      ordered.push(r.role);
    }
  }
  const usedLanes = new Set(rows.filter((r) => r.kind === "step" && r.role).map((r) => r.role));
  const lanes = ordered
    .filter((id) => usedLanes.has(id))
    .map((id) => ({
      id,
      label: (roles[id] && roles[id].label) || id,
      textColor: (roles[id] && roles[id].textColor) || null,
      bg: (roles[id] && roles[id].bg) || null,
      icon: (roles[id] && roles[id].icon) || null,
    }));

  return {
    title,
    page,
    options: options_,
    providedColumnTitles: [...providedColumnTitles],
    lanes,
    rows,
    blocks,
    props,
    errors,
    trailingLineComments: pendingComments,
    providedPageKeys: [...providedPageKeys],
    roles,
    meta,
    languages: langs,
    lang: langs[langIndex] ?? null,
    dslVersion: 2,
  };

  // ------------------------------------------------------------- statements
  function applyDefProp(kind, id, prop) {
    const bag = kind === "role" ? roles : kind === "block" ? blocks : props;
    const map = kind === "role" ? ROLE_MAP : kind === "block" ? BLOCK_MAP : PROP_MAP;
    if (prop.key === "unset") {
      for (const name of prop.value
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)) {
        const target = map[name];
        if (!target) err(prop.pos, `unset: unknown /${kind}/ key: ${name}`);
        else delete bag[id][target];
      }
      return;
    }
    const field = map[prop.key];
    if (!field) {
      err(prop.pos, `unknown /${kind}/ key: ${prop.key}`);
      return;
    }
    if (prop.value === "none") {
      delete bag[id][field];
      return;
    }
    if (
      kind === "block" &&
      prop.key === "shape" &&
      !BLOCK_SHAPE_WIDTH_FACTOR[prop.value.toLowerCase()]
    ) {
      err(prop.pos, `unknown shape "${prop.value}"`);
      return;
    }
    if (kind === "prop" && field === "side") {
      const side = prop.value.toLowerCase();
      if (side !== "left" && side !== "right") {
        err(prop.pos, `side: must be left or right (got "${prop.value}")`);
        return;
      }
      bag[id].side = side;
      return;
    }
    if (kind === "prop" && field === "maxChars") {
      const n = parseInt(prop.value, 10);
      if (!/^\d+$/.test(prop.value.trim()) || n <= 0) {
        err(prop.pos, `max-chars: must be a positive integer (got "${prop.value}")`);
        return;
      }
      bag[id].maxChars = n;
      return;
    }
    applyLocalized(bag[id], field, prop);
  }

  function applyOption(prop) {
    const key = prop.key;
    if (DIAGRAM_OPTION_DSL_MAP[key]) {
      const v = BOOLS[prop.value.toLowerCase()];
      if (v === undefined) err(prop.pos, `"${key}": expected true or false`);
      else options_[DIAGRAM_OPTION_DSL_MAP[key]] = v;
      return;
    }
    if (OPTION_COLUMN_TITLE_DSL_MAP[key]) {
      const field = OPTION_COLUMN_TITLE_DSL_MAP[key];
      applyLocalized(page, field, prop);
      providedPageKeys.add(field);
      providedColumnTitles.add(field);
      return;
    }
    if (
      [
        "lang",
        "i18n-strict",
        "i18n-uniform-layout",
        "i18n-storage",
        "show-notes",
        "auto-define",
      ].includes(key)
    )
      return;
    err(prop.pos, `unknown /option/ key: ${key}`);
  }

  function readFlowStatement(pos) {
    // Step or spacer.
    if (sc.s[sc.i] === "[") {
      readStep(pos);
      return;
    }
    const save = sc.i;
    const w = sc.word();
    if (CLOSERS[w]) {
      closeFrame(w, pos);
      return;
    }
    if (w === "case" || w === "else") {
      readCase(w, pos);
      return;
    }
    if (w === "and") {
      readAnd(pos);
      return;
    }
    if (w === "goto" || w === "loop") {
      readJump(w, pos);
      return;
    }
    if (OPENERS.includes(w)) {
      openFrame(w, pos);
      return;
    }
    // A property row attaches to the preceding statement.
    sc.i = save;
    const prop = readProperty();
    if (prop) {
      applyStepProp(prop);
      return;
    }
    err(pos, `unknown statement "${w || sc.s[sc.i]}"`);
    sc.i = Math.max(sc.i + 1, pos + 1);
  }

  function readStep(pos) {
    sc.i++;
    if (sc.s[sc.i] === "]") {
      sc.i++;
      lastStep = push(
        { kind: "step", role: null, text: "", depth: stepDepth(), empty: true, stepId: null },
        pos,
      );
      return;
    }
    const role = readRun(sc, [":", "：", "]"], null);
    if (sc.s[sc.i] === ":" || sc.s[sc.i] === "：") sc.i++;
    else {
      err(pos, "step lines must use [roleId: text]");
      return;
    }
    const text = readText(sc, ["]"], ["[", "]"]);
    if (sc.s[sc.i] === "]") sc.i++;
    else err(pos, "unclosed [ — the run must end with ]");

    let blockRef = null;
    let stepId = null;
    let arrowLine = null;
    let link = null;
    const stepProps = [];
    for (;;) {
      const mark = sc.i;
      sc.skipWs();
      if (sc.s[sc.i] === "<") {
        sc.i++;
        blockRef = readRun(sc, [">"], null);
        if (sc.s[sc.i] === ">") sc.i++;
        continue;
      }
      if (sc.s[sc.i] === "@") {
        sc.i++;
        const w = sc.word();
        if (["end", "use", "lang", "kai-swimlane"].includes(w)) {
          sc.i = mark;
          break;
        }
        stepId = w;
        continue;
      }
      if (sc.s[sc.i] === "+") {
        sc.i++;
        const id = sc.word();
        if (id) stepProps.push(id);
        continue;
      }
      if (sc.peek("=>")) {
        sc.i += 2;
        sc.skipWs();
        const start = sc.i;
        while (!sc.eof && !isWs(sc.s[sc.i]) && sc.s[sc.i] !== ";" && sc.s[sc.i] !== "]") sc.i++;
        link = sc.s.slice(start, sc.i);
        continue;
      }
      const glyph = GLYPHS.find(([g]) => sc.peek(g));
      if (glyph) {
        sc.i += glyph[0].length;
        arrowLine = normalizeArrowLine(glyph[1]);
        continue;
      }
      sc.i = mark;
      break;
    }

    if (!roles[role]) roles[role] = { id: role };
    for (const id of stepProps) if (!props[id]) props[id] = { id, label: id, side: "right" };

    const fields = {
      kind: "step",
      role,
      text: seg(text),
      depth: stepDepth(),
      blockRef,
      stepId: stepId || `step-${rows.length + 1}`,
    };
    if (stepProps.length) fields.props = stepProps;
    if (arrowLine) fields.arrowLine = arrowLine;
    if (link) fields.link = link;
    if (stepId) {
      fields.mergeId = stepId;
      if (stepIds.has(stepId)) err(pos, `duplicate node id "${stepId}"`);
      stepIds.set(stepId, rows.length);
    }
    lastStep = push(fields, pos);
  }

  function applyStepProp(prop) {
    const target = lastStatement >= 0 ? rows[lastStatement] : null;
    if (!target) {
      err(prop.pos, `"${prop.key}" has no preceding statement`);
      return;
    }
    const isStep = target.kind === "step";
    switch (prop.key) {
      case "label":
        if (!isStep) {
          applyLocalized(target, "label", prop);
          return;
        }
        applyLocalized(target, "name", prop);
        return;
      case "desc":
        if (!isStep) return;
        applyLocalized(target, "description", prop);
        return;
      case "remark":
        if (!isStep) return;
        applyLocalized(target, "remark", prop);
        return;
      case "remark-desc": {
        const prev = target.remark || "";
        const next = seg(prop.value);
        if (!prop.tag || langs.indexOf(prop.tag) === langIndex) {
          target.remark = prev ? `${prev}\n\n${next}` : next;
        }
        return;
      }
      case "skip":
        target.skipIndex = true;
        return;
      case "note":
      case "note-side":
      case "question":
      case "lane":
        return;
      default:
        err(prop.pos, `"${prop.key}" is not a property of this statement`);
    }
  }

  function openFrame(kw, pos) {
    let lane = null;
    sc.skipWs();
    if (kw === "if" && sc.s[sc.i] === "[") {
      sc.i++;
      lane = readRun(sc, ["]"], null);
      if (sc.s[sc.i] === "]") sc.i++;
    }
    let text = null;
    sc.skipWs();
    if (sc.s[sc.i] === "(" || sc.s[sc.i] === "（") {
      sc.i++;
      text = readText(sc, [")", "）"], ["(", ")"]);
      if (sc.s[sc.i] === ")" || sc.s[sc.i] === "）") sc.i++;
    }
    const { color, id } = readOpenerSuffixes(pos);

    if (kw === "if" || kw === "fork") {
      if (kw === "if" && text === null) err(pos, "if requires a question");
      branchCounter++;
      const branchId = branchCounter;
      const depth = branchMarkerDepth();
      stack.push({ id: branchId, depth, type: kw, awaitingCase: kw === "if" });
      const idx = push(
        {
          kind: "branchStart",
          ...(kw === "fork" ? { parallel: true } : {}),
          cond: kw === "if" ? seg(text ?? "") : null,
          firstCase: null,
          branchColor: color,
          lane: lane || undefined,
          id: branchId,
          depth,
        },
        pos,
      );
      if (id) stepIds.set(id, idx);
      if (kw === "fork") {
        // `fork (label)` names path one; the model carries paths as cases.
        push(
          {
            kind: "branchCase",
            parallel: true,
            label: text ? seg(text) : "",
            branchColor: color,
            id: branchId,
            depth: branchControlDepth(),
          },
          pos,
        );
      }
      return;
    }

    const groupMode = kw === "branch" ? "branch" : "section";
    groupCounter++;
    const gid = groupCounter;
    const depth = groupMarkerDepth();
    groupStack.push({ id: gid, depth, groupMode, kw });
    const idx = push(
      {
        kind: "groupStart",
        id: gid,
        depth,
        groupMode,
        sectionName: text ? seg(text) : kw === "branch" ? "Branch" : "Section",
        sectionColor: color,
      },
      pos,
    );
    if (id) stepIds.set(id, idx);
  }

  function closeFrame(closer, pos) {
    const kw = CLOSERS[closer];
    if (kw === "if" || kw === "fork") {
      const top = stack[stack.length - 1];
      if (!top || top.type !== kw) {
        err(pos, `${closer} closes ${top ? top.type : "nothing"}`);
        return;
      }
      stack.pop();
      push(
        {
          kind: "branchEnd",
          ...(kw === "fork" ? { parallel: true } : {}),
          id: top.id,
          depth: top.depth,
        },
        pos,
      );
      return;
    }
    const top = groupStack[groupStack.length - 1];
    if (!top || top.kw !== kw) {
      err(pos, `${closer} closes ${top ? top.kw : "nothing"}`);
      return;
    }
    groupStack.pop();
    push({ kind: "groupEnd", id: top.id, depth: top.depth, groupMode: top.groupMode }, pos);
  }

  function readCase(kw, pos) {
    let text = "";
    sc.skipWs();
    if (kw === "case") {
      if (sc.s[sc.i] === "(" || sc.s[sc.i] === "（") {
        sc.i++;
        text = readText(sc, [")", "）"], ["(", ")"]);
        if (sc.s[sc.i] === ")" || sc.s[sc.i] === "）") sc.i++;
      } else {
        err(pos, "case requires a label");
      }
    }
    const { color } = readOpenerSuffixes(pos);
    const top = stack[stack.length - 1];
    if (!top || top.type !== "if") {
      err(pos, `${kw} outside if`);
      return;
    }
    // The model carries the first case on `branchStart`.
    if (top.awaitingCase) {
      top.awaitingCase = false;
      const start = rows.findLast((r) => r.kind === "branchStart" && r.id === top.id);
      if (start) {
        start.firstCase = kw === "else" ? "else" : seg(text);
        if (color) start.branchColor = start.branchColor || color;
        return;
      }
    }
    push(
      {
        kind: "branchCase",
        label: kw === "else" ? "else" : seg(text),
        branchColor: color,
        id: top.id,
        depth: branchControlDepth(),
      },
      pos,
    );
  }

  function readAnd(pos) {
    let text = "";
    sc.skipWs();
    if (sc.s[sc.i] === "(" || sc.s[sc.i] === "（") {
      sc.i++;
      text = readText(sc, [")", "）"], ["(", ")"]);
      if (sc.s[sc.i] === ")" || sc.s[sc.i] === "）") sc.i++;
    }
    const { color } = readOpenerSuffixes(pos);
    const top = stack[stack.length - 1];
    if (!top || top.type !== "fork") {
      err(pos, "and outside fork");
      return;
    }
    push(
      {
        kind: "branchCase",
        parallel: true,
        label: text ? seg(text) : "",
        branchColor: color,
        id: top.id,
        depth: branchControlDepth(),
      },
      pos,
    );
  }

  function readJump(kw, pos) {
    sc.skipWs();
    let target = null;
    if (sc.s[sc.i] === "@") {
      sc.i++;
      target = sc.word();
    }
    const top = stack[stack.length - 1];
    if (kw === "loop") {
      if (!top || top.type !== "if") {
        err(pos, "loop outside if");
        return;
      }
      if (target) jumps.push({ target, pos });
      push({ kind: "branchLoop", loopBranchId: top.id, depth: branchBodyDepth() }, pos);
      return;
    }
    if (!target) {
      err(pos, "goto requires a target");
      return;
    }
    if (!top || top.type !== "if") {
      err(pos, "goto outside if is not supported by this renderer");
      return;
    }
    jumps.push({ target, pos });
    push(
      { kind: "branchMerge", mergeTarget: target, mergeBranchId: top.id, depth: branchBodyDepth() },
      pos,
    );
  }
}

function stripEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== "" && v != null) out[k] = v;
  return out;
}
function mergeDefs(into, from) {
  for (const [id, def] of Object.entries(from ?? {})) {
    into[id] = { ...(into[id] ?? {}), ...def };
  }
}
function emptyPage() {
  return {
    description: "",
    ...DEFAULT_COLUMN_TITLES,
    headerLeft: "",
    headerCenter: "",
    headerRight: "",
    footerLeft: "",
    footerCenter: "",
    footerRight: "",
  };
}
function emptyModel(errors) {
  return {
    title: "",
    page: emptyPage(),
    options: emptyDiagramOptions(),
    providedColumnTitles: [],
    lanes: [],
    rows: [],
    blocks: {},
    props: {},
    errors,
    trailingLineComments: [],
    dslVersion: 2,
  };
}

/** A header-less fragment: definitions and catalog entries only. */
export function parseFragmentV2(text, options = {}) {
  const model = parseDSLv2(`@kai-swimlane 2\n${text}`, options);
  return {
    page: model.page,
    options: model.options,
    providedColumnTitles: model.providedColumnTitles,
    providedPageKeys: model.providedPageKeys ?? [],
    roles: model.roles ?? {},
    blocks: model.blocks,
    props: model.props,
    catalog: {},
    errors: model.errors,
  };
}
