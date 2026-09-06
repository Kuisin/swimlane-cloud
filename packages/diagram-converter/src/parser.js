import { normalizeArrowLine, ARROW_LINE_TYPES } from "./arrow-line.js";
import { getLucideIconNode } from "./render-pure/icon-paths.js";
import { BLOCK_SHAPE_WIDTH_FACTOR, BRANCH_COLOR_STYLES } from "./render-pure/diagram-layout.js";
import { parseDSLv2, dslVersion } from "./parser-v2.js";

// The version 2 reader's public surface, re-exported so a host that imports
// the parser entry point gets the whole DSL API from one module.
export {
  ASSET_EXTENSIONS,
  ASSET_MAX_BYTES,
  ASSET_TOTAL_MAX_BYTES,
  checkImportPath,
  dirOf,
  dslVersion,
  parseDSLv2,
  scanImports,
} from "./parser-v2.js";
import {
  DEFAULT_COLUMN_TITLES,
  DIAGRAM_OPTION_DSL_MAP,
  OPTION_COLUMN_TITLE_DSL_MAP,
  emptyDiagramOptions,
  parseOptionBoolean,
} from "./diagram-options.js";

/** `key: value;` in /role/, /block/, /prop/ — trailing semicolon is required. */
function parseSectionPropertyLine(text) {
  const m = text.match(/^([a-zA-Z\-]+)\s*:\s*(.+);$/);
  if (m) return { key: m[1].toLowerCase(), val: m[2].trim() };
  if (/^[a-zA-Z\-]+\s*:\s*.+/.test(text)) return { missingSemicolon: true };
  return null;
}

/**
 * An `icon:` value of the form `#name` references a Lucide icon by name. Returns
 * the name when it isn't one the engine can render (so the caller can flag it);
 * plain (non-`#`) values are literal text/emoji and are left alone.
 */
function unknownIconName(val) {
  if (typeof val !== "string" || !val.startsWith("#")) return null;
  const name = val.slice(1).trim();
  if (name && !getLucideIconNode(name)) return name;
  return null;
}

const PAGE_PROPERTY_MAP = {
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

function parseOptionSection(items, errors) {
  const options = emptyDiagramOptions();
  const columnTitles = {};
  for (const { text, line } of items) {
    const t = text.trim();
    if (!t) continue;
    const kv = parseSectionPropertyLine(t);
    if (kv?.missingSemicolon) {
      errors.push({ line, text, msg: "property line must end with ';'" });
      continue;
    }
    if (!kv) {
      errors.push({ line, text, msg: "unrecognized /option/ line" });
      continue;
    }
    const boolField = DIAGRAM_OPTION_DSL_MAP[kv.key];
    if (boolField) {
      const bool = parseOptionBoolean(kv.val);
      if (bool === null) {
        errors.push({
          line,
          text,
          msg: `${kv.key}: expected true or false`,
        });
        continue;
      }
      options[boolField] = bool;
      continue;
    }
    const titleField = OPTION_COLUMN_TITLE_DSL_MAP[kv.key];
    if (titleField) {
      columnTitles[titleField] = kv.val;
      continue;
    }
    errors.push({ line, text, msg: `unknown /option/ key: ${kv.key}` });
  }
  return { options, columnTitles };
}

/**
 * Read `key: ``` … ```;` from section lines. Single-line `key: value;` when no fence.
 * @returns {{ value?: string, error?: object, nextIndex: number } | null}
 */
function parseKeyedProperty(items, startIndex, key) {
  const { text, line } = items[startIndex];
  const t = text.trim();
  const keyRe = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^${keyRe}:\\s*\`\`\`\\s*$`, "i").test(t)) {
    const parts = [];
    let j = startIndex + 1;
    while (j < items.length) {
      const close = items[j].text.trim();
      if (/^```;?\s*$/.test(close)) {
        return { value: parts.join("\n").trim(), nextIndex: j + 1 };
      }
      parts.push(items[j].text);
      j++;
    }
    return {
      error: { line, text, msg: `${key}: missing closing \`\`\`` },
      nextIndex: startIndex + 1,
    };
  }
  const single = t.match(new RegExp(`^${keyRe}:\\s*(.+);\\s*$`, "i"));
  if (single) return { value: single[1].trim(), nextIndex: startIndex + 1 };
  if (new RegExp(`^${keyRe}:\\s*`, "i").test(t)) {
    return {
      error: {
        line,
        text,
        msg: `${key}: line must end with ';' or use multiline \`\`\``,
      },
      nextIndex: startIndex + 1,
    };
  }
  return null;
}

function parsePageSection(items, errors) {
  const page = emptyPage();
  for (let i = 0; i < items.length; i++) {
    const { text, line } = items[i];
    const t = text.trim();
    if (!t) continue;
    let matched = false;
    for (const [dslKey, field] of Object.entries(PAGE_PROPERTY_MAP)) {
      const parsed = parseKeyedProperty(items, i, dslKey);
      if (!parsed) continue;
      matched = true;
      if (parsed.error) errors.push(parsed.error);
      else page[field] = parsed.value || "";
      i = parsed.nextIndex - 1;
      break;
    }
    if (!matched) {
      errors.push({ line, text, msg: "unrecognized /page/ line" });
    }
  }
  return page;
}

/** Whole-line comments (ignored in all sections). `***` kept for backward compatibility. */
export function isDslCommentLine(trimmed) {
  const t = (trimmed || "").trim();
  return t.startsWith("//") || t.startsWith("***");
}

/** Unescape so `&lt;block01&gt;` and similar are parsed like `<block01>`. */
export function unescapeDslLine(line) {
  return line
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

/** 出現順の表示番号。skipIndex の行は件数に含めず番号なし。 */
export function buildStepRowDisplayInfo(rows) {
  const out = new Map();
  let index = 1;
  rows.forEach((r, i) => {
    if (r.kind !== "step" || r.empty || !r.role) return;
    if (r.skipIndex) {
      out.set(i, { skipped: true });
      return;
    }
    out.set(i, { displayIndex: index++ });
  });
  return out;
}

export function parseDSL(src, parseOptions = {}) {
  // Version 2 is a different language, read by its own module; the bare
  // `@kai-swimlane` header below still selects version 1.
  const version = dslVersion(src);
  if (version !== null && version >= 2) {
    if (version > 2) {
      return {
        title: "",
        page: emptyPage(),
        options: emptyDiagramOptions(),
        providedColumnTitles: [],
        lanes: [],
        rows: [],
        blocks: {},
        props: {},
        errors: [
          {
            line: 1,
            text: "",
            msg: `unsupported version ${version} — this file needs a newer build`,
          },
        ],
        trailingLineComments: [],
      };
    }
    return parseDSLv2(src, parseOptions);
  }
  const allLines = src.split(/\r?\n/);
  const errors = [];

  let startIdx = -1;
  let endIdx = allLines.length;
  let foundEnd = false;
  for (let i = 0; i < allLines.length; i++) {
    const t = allLines[i].trim();
    if (t === "@kai-swimlane") {
      startIdx = i;
      continue;
    }
    if (t === "@end" && startIdx >= 0) {
      endIdx = i;
      foundEnd = true;
      break;
    }
  }
  if (startIdx < 0) {
    return {
      title: "",
      page: emptyPage(),
      options: emptyDiagramOptions(),
      lanes: [],
      rows: [],
      blocks: {},
      props: {},
      errors: [{ line: 1, text: "", msg: "@kai-swimlane marker not found" }],
    };
  }

  if (!foundEnd) {
    errors.push({
      line: allLines.length,
      text: allLines[allLines.length - 1] ?? "",
      msg: "missing @end marker",
    });
  }

  const lines = allLines.slice(startIdx + 1, endIdx);
  const sections = {
    page: [],
    option: [],
    title: [],
    role: [],
    block: [],
    prop: [],
    line: [],
  };
  let current = null;
  // Inside a ``` … ``` fence, lines are content (incl. ones that look like
  // comments or section markers), so they must be kept verbatim.
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    const lineNum = startIdx + 1 + i + 1;
    if (inFence) {
      if (current) sections[current].push({ text: raw, line: lineNum });
      if (/^```;?\s*$/.test(t)) inFence = false;
      continue;
    }
    if (!t) {
      if (current) sections[current].push({ text: raw, line: lineNum });
      continue;
    }
    if (isDslCommentLine(t) || t.startsWith("@")) {
      // Keep /line/ comments so the formatter can round-trip them; they are
      // ignored everywhere else.
      if (current === "line" && isDslCommentLine(t)) {
        sections.line.push({ text: raw, line: lineNum, isComment: true });
      }
      continue;
    }
    const sec = t.match(/^\/(page|title|role|option|block|prop|line)\/$/);
    if (sec) {
      current = sec[1];
      continue;
    }
    if (current) sections[current].push({ text: raw, line: lineNum });
    // A `key: ``` opener starts a fenced (multi-line) value.
    if (/^[A-Za-z][A-Za-z-]*:\s*```\s*$/.test(t)) inFence = true;
  }

  const page = parsePageSection(sections.page, errors);
  const { options, columnTitles } = parseOptionSection(sections.option, errors);
  // Track which gutter-title fields were written explicitly (in /option/ or
  // /page/) so the formatter keeps them even when they equal the default.
  const providedColumnTitles = new Set(Object.keys(columnTitles));
  for (const { text } of sections.page) {
    const kv = parseSectionPropertyLine(text.trim());
    const field = kv?.key && PAGE_PROPERTY_MAP[kv.key];
    if (field && OPTION_COLUMN_TITLE_DSL_MAP[kv.key]) providedColumnTitles.add(field);
  }
  for (const [field, value] of Object.entries(columnTitles)) {
    page[field] = value;
  }

  const title = sections.title
    .map((l) => l.text.trim())
    .filter(Boolean)
    .join(" ");

  const roles = {};
  {
    let active = null;
    for (const { text, line } of sections.role) {
      const t = text.trim();
      if (!t) continue;
      const m = t.match(/^<([^>]+)>$/);
      if (m) {
        active = m[1].trim();
        if (!active) {
          errors.push({ line, text, msg: "definition id must not be empty" });
          active = null;
          continue;
        }
        if (roles[active]) {
          errors.push({ line, text, msg: `duplicate role definition <${active}>` });
        } else {
          roles[active] = { id: active };
        }
        continue;
      }
      const kv = parseSectionPropertyLine(t);
      if (kv?.missingSemicolon) {
        errors.push({ line, text, msg: "property line must end with ';'" });
        continue;
      }
      if (!kv) {
        errors.push({ line, text, msg: "unrecognized /role/ line" });
        continue;
      }
      if (!active) {
        errors.push({ line, text, msg: "property line must follow a <id> definition" });
        continue;
      }
      const map = {
        label: "label",
        "text-color": "textColor",
        "background-color": "bg",
        icon: "icon",
      };
      if (!map[kv.key]) {
        errors.push({ line, text, msg: `unknown /role/ key: ${kv.key}` });
        continue;
      }
      roles[active][map[kv.key]] = kv.val;
      const badIcon = kv.key === "icon" ? unknownIconName(kv.val) : null;
      if (badIcon) {
        errors.push({ line, text, msg: `unknown icon "${badIcon}" — not a known Lucide icon` });
      }
    }
  }

  const blocks = {};
  {
    let active = null;
    for (const { text, line } of sections.block) {
      const t = text.trim();
      if (!t) continue;
      const m = t.match(/^<([^>]+)>$/);
      if (m) {
        active = m[1].trim();
        if (!active) {
          errors.push({ line, text, msg: "definition id must not be empty" });
          active = null;
          continue;
        }
        if (blocks[active]) {
          errors.push({ line, text, msg: `duplicate block definition <${active}>` });
        } else {
          blocks[active] = { id: active };
        }
        continue;
      }
      const kv = parseSectionPropertyLine(t);
      if (kv?.missingSemicolon) {
        errors.push({ line, text, msg: "property line must end with ';'" });
        continue;
      }
      if (!kv) {
        errors.push({ line, text, msg: "unrecognized /block/ line" });
        continue;
      }
      if (!active) {
        errors.push({ line, text, msg: "property line must follow a <id> definition" });
        continue;
      }
      const map = {
        "background-color": "bg",
        "text-color": "textColor",
        "border-color": "borderColor",
        shape: "shape",
        icon: "icon",
        label: "label",
      };
      if (!map[kv.key]) {
        errors.push({ line, text, msg: `unknown /block/ key: ${kv.key}` });
        continue;
      }
      if (kv.key === "shape" && !BLOCK_SHAPE_WIDTH_FACTOR[kv.val.toLowerCase()]) {
        errors.push({
          line,
          text,
          msg: `unknown shape "${kv.val}" — use one of ${Object.keys(BLOCK_SHAPE_WIDTH_FACTOR).join(", ")}`,
        });
        continue;
      }
      blocks[active][map[kv.key]] = kv.val;
      const badIcon = kv.key === "icon" ? unknownIconName(kv.val) : null;
      if (badIcon) {
        errors.push({ line, text, msg: `unknown icon "${badIcon}" — not a known Lucide icon` });
      }
    }
  }

  const props = {};
  {
    let active = null;
    for (const { text, line } of sections.prop) {
      const t = text.trim();
      if (!t) continue;
      const m = t.match(/^<([^>]+)>$/);
      if (m) {
        active = m[1].trim();
        if (!active) {
          errors.push({ line, text, msg: "definition id must not be empty" });
          active = null;
          continue;
        }
        if (props[active]) {
          errors.push({ line, text, msg: `duplicate prop definition <${active}>` });
        } else {
          props[active] = { id: active, label: active, side: "right" };
        }
        continue;
      }
      const kv = parseSectionPropertyLine(t);
      if (kv?.missingSemicolon) {
        errors.push({ line, text, msg: "property line must end with ';'" });
        continue;
      }
      if (!kv) {
        errors.push({ line, text, msg: "unrecognized /prop/ line" });
        continue;
      }
      if (!active) {
        errors.push({ line, text, msg: "property line must follow a <id> definition" });
        continue;
      }
      const propMap = {
        label: "label",
        side: "side",
        "background-color": "bg",
        "border-color": "borderColor",
        "text-color": "textColor",
        title: "title",
        hint: "title",
        "max-chars": "maxChars",
      };
      const field = propMap[kv.key];
      if (!field) {
        errors.push({ line, text, msg: `unknown /prop/ key: ${kv.key}` });
        continue;
      }
      if (field === "label") props[active].label = kv.val;
      else if (field === "side") {
        const side = kv.val.toLowerCase();
        if (side !== "left" && side !== "right") {
          errors.push({ line, text, msg: `side: must be left or right (got "${kv.val}")` });
          continue;
        }
        props[active].side = side;
      } else if (field === "maxChars") {
        const n = parseInt(kv.val, 10);
        if (Number.isNaN(n) || n <= 0 || !/^\d+$/.test(kv.val.trim())) {
          errors.push({
            line,
            text,
            msg: `max-chars: must be a positive integer (got "${kv.val}")`,
          });
          continue;
        }
        props[active].maxChars = n;
      } else props[active][field] = kv.val;
    }
  }

  /**
   * `/line/` parses into a flat list of `rows`, each tagged with a `kind`:
   *   - step                          a task in a lane (`[role: text]`)
   *   - branchStart / branchCase / branchEnd
   *                                   an `if`/`fork` block; `parallel: true`
   *                                   marks the `fork`/`and`/`endfork` variant
   *   - branchLoop                    `[loop]` back-edge to the enclosing `if`
   *   - branchMerge                   `merge: <id>;` jump to a step with matching `id:`
   *   - groupStart / groupEnd         a group with `groupMode`: "section" draws
   *                                   a visual box (steps flow normally), while
   *                                   "branch" is a mid-flow sub-branch (start
   *                                   not connected; merges to main after close)
   * `stack` tracks open branch frames so nested blocks get the right depth and
   * so each closer (`endif`/`endfork`) matches the frame type it closes.
   */
  const rows = [];
  const stack = [];
  const groupStack = [];
  /** if/fork markers share one level; case/path body is one indent (2 spaces) deeper. */
  function branchMarkerDepth() {
    if (stack.length === 0) return 0;
    return stack[stack.length - 1].depth + 1;
  }
  function branchControlDepth() {
    if (stack.length === 0) return 0;
    return stack[stack.length - 1].depth;
  }
  function branchBodyDepth() {
    if (stack.length === 0) return 0;
    return stack[stack.length - 1].depth + 1;
  }
  function groupMarkerDepth() {
    if (groupStack.length === 0) return branchBodyDepth();
    return groupStack[groupStack.length - 1].depth + 1;
  }
  function stepDepth() {
    if (groupStack.length === 0) return branchBodyDepth();
    return groupStack[groupStack.length - 1].depth + 1;
  }
  let branchCounter = 0;
  let groupCounter = 0;
  let lastRealStepIndex = -1;
  let autoIdCounter = 0;
  /** @type {Map<string, { line: number, text: string }>} */
  const mergeIdsSeen = new Map();
  /** Comment lines waiting to attach to the next row (so the formatter keeps them). */
  let pendingComments = [];

  function pushLineRow(fields, line) {
    const row = { ...fields, dslLines: [line] };
    if (pendingComments.length) {
      row.leadingComments = pendingComments;
      pendingComments = [];
    }
    rows.push(row);
  }

  /** Validate a `#color` token against the named branch/section palette. */
  function checkColorToken(token, line, text) {
    if (!token) return;
    const c = token.trim().toLowerCase();
    if (!BRANCH_COLOR_STYLES[c]) {
      errors.push({
        line,
        text,
        msg: `unknown color "#${c}" — use one of ${Object.keys(BRANCH_COLOR_STYLES).join(", ")}`,
      });
    }
  }

  function appendLineToRow(rowIndex, line) {
    if (rowIndex < 0 || rowIndex >= rows.length) return;
    const row = rows[rowIndex];
    if (!row.dslLines) row.dslLines = [line];
    else if (!row.dslLines.includes(line)) row.dslLines.push(line);
  }

  function attachSectionLinesToRow(rowIndex, startIdx, endIdx) {
    for (let k = startIdx; k < endIdx; k++) {
      appendLineToRow(rowIndex, sections.line[k].line);
    }
  }

  for (let lineIdx = 0; lineIdx < sections.line.length; lineIdx++) {
    const item = sections.line[lineIdx];
    const { text, line } = item;
    const trimmed = text.trim();
    if (item.isComment) {
      pendingComments.push(trimmed);
      continue;
    }
    if (!trimmed || isDslCommentLine(trimmed)) continue;
    const u = unescapeDslLine(trimmed);
    if (!u) continue;

    let m = u.match(/^if\s*\((.+?)\)\s*is\s*\((.+?)\)\s*than(?:\s+#([A-Za-z]+))?$/i);
    if (m) {
      checkColorToken(m[3], line, text);
      branchCounter++;
      const id = branchCounter;
      const depth = branchMarkerDepth();
      stack.push({ id, depth, type: "if" });
      pushLineRow(
        {
          kind: "branchStart",
          cond: m[1].trim(),
          firstCase: m[2].trim(),
          branchColor: m[3] ? m[3].trim().toLowerCase() : null,
          id,
          depth,
        },
        line,
      );
      continue;
    }
    m = u.match(/^elseif\s*\((.+?)\)\s*than(?:\s+#([A-Za-z]+))?$/i);
    if (m) {
      checkColorToken(m[2], line, text);
      const top = stack[stack.length - 1];
      if (!top || top.type !== "if") {
        errors.push({ line, text, msg: "elseif without if" });
        continue;
      }
      pushLineRow(
        {
          kind: "branchCase",
          label: m[1].trim(),
          branchColor: m[2] ? m[2].trim().toLowerCase() : null,
          id: top.id,
          depth: branchControlDepth(),
        },
        line,
      );
      continue;
    }
    if (/^else$/i.test(u)) {
      const top = stack[stack.length - 1];
      if (!top || top.type !== "if") {
        errors.push({ line, text, msg: "else without if" });
        continue;
      }
      pushLineRow(
        {
          kind: "branchCase",
          label: "else",
          id: top.id,
          depth: branchControlDepth(),
        },
        line,
      );
      continue;
    }
    if (/^endif$/i.test(u)) {
      const top = stack[stack.length - 1];
      if (!top || top.type !== "if") {
        errors.push({ line, text, msg: "endif without if" });
        continue;
      }
      stack.pop();
      pushLineRow({ kind: "branchEnd", id: top.id, depth: top.depth }, line);
      continue;
    }

    /** Parallel split: `fork` opens, `and` adds a concurrent path, `endfork` joins. */
    m = u.match(/^fork(?:\s+#([A-Za-z]+))?$/i);
    if (m) {
      checkColorToken(m[1], line, text);
      branchCounter++;
      const id = branchCounter;
      const depth = branchMarkerDepth();
      stack.push({ id, depth, type: "fork" });
      pushLineRow(
        {
          kind: "branchStart",
          parallel: true,
          cond: null,
          firstCase: null,
          branchColor: m[1] ? m[1].trim().toLowerCase() : null,
          id,
          depth,
        },
        line,
      );
      continue;
    }
    m = u.match(/^and(?:\s+#([A-Za-z]+))?$/i);
    if (m) {
      checkColorToken(m[1], line, text);
      const top = stack[stack.length - 1];
      if (!top || top.type !== "fork") {
        errors.push({ line, text, msg: "and without fork" });
        continue;
      }
      pushLineRow(
        {
          kind: "branchCase",
          parallel: true,
          label: "",
          branchColor: m[1] ? m[1].trim().toLowerCase() : null,
          id: top.id,
          depth: branchControlDepth(),
        },
        line,
      );
      continue;
    }
    if (/^endfork$/i.test(u)) {
      const top = stack[stack.length - 1];
      if (!top || top.type !== "fork") {
        errors.push({ line, text, msg: "endfork without fork" });
        continue;
      }
      stack.pop();
      pushLineRow({ kind: "branchEnd", parallel: true, id: top.id, depth: top.depth }, line);
      continue;
    }

    /**
     * Groups come in two flavors that the parser distinguishes via `groupMode`:
     *   - "section": a purely visual box; the steps inside flow normally.
     *   - "branch":  a new sub-branch mid flow; its first step is not connected
     *                to the main flow and its last step merges back after the
     *                close. No box is drawn.
     */
    const openGroup = (groupMode, name, colorToken) => {
      checkColorToken(colorToken, line, text);
      groupCounter++;
      const id = groupCounter;
      const depth = groupMarkerDepth();
      groupStack.push({ id, depth, groupMode });
      pushLineRow(
        {
          kind: "groupStart",
          id,
          depth,
          groupMode,
          sectionName: name,
          sectionColor: colorToken ? colorToken.trim().toLowerCase() : null,
        },
        line,
      );
    };

    // Visual box: section (name) / section / legacy section-start / start-point.
    m = u.match(/^(?:section|section-start)\s*\((.+?)\)(?:\s+#([A-Za-z]+))?$/i);
    if (m) {
      openGroup("section", m[1].trim(), m[2]);
      continue;
    }
    m = u.match(/^section(?:\s+#([A-Za-z]+))?$/i);
    if (m) {
      openGroup("section", "Section", m[1]);
      continue;
    }
    if (/^start-point$/i.test(u)) {
      openGroup("section", "Section", null);
      continue;
    }

    // Mid-flow branch: branch (name) / branch.
    m = u.match(/^branch\s*\((.+?)\)(?:\s+#([A-Za-z]+))?$/i);
    if (m) {
      openGroup("branch", m[1].trim(), m[2]);
      continue;
    }
    m = u.match(/^branch(?:\s+#([A-Za-z]+))?$/i);
    if (m) {
      openGroup("branch", "Branch", m[1]);
      continue;
    }

    if (/^end-section$/i.test(u) || /^end-point$/i.test(u) || /^end-branch$/i.test(u)) {
      const top = groupStack.pop();
      if (!top) {
        errors.push({ line, text, msg: "end-section without section" });
        continue;
      }
      pushLineRow(
        { kind: "groupEnd", id: top.id, depth: top.depth, groupMode: top.groupMode },
        line,
      );
      continue;
    }

    if (/^:\s*;?$/.test(u)) {
      pushLineRow(
        {
          kind: "step",
          role: null,
          text: "",
          depth: stepDepth(),
          empty: true,
          stepId: null,
        },
        line,
      );
      continue;
    }

    if (/^id:\s*/i.test(u)) {
      if (lastRealStepIndex >= 0) appendLineToRow(lastRealStepIndex, line);
      m = u.match(/^id:\s*(.+);\s*$/i);
      if (!m) {
        errors.push({ line, text, msg: "id: line must end with ';'" });
        continue;
      }
      if (lastRealStepIndex < 0) {
        errors.push({ line, text, msg: "id: has no preceding step" });
        continue;
      }
      const idVal = m[1].trim();
      if (!idVal) {
        errors.push({ line, text, msg: "id: value must not be empty" });
        continue;
      }
      const prevId = mergeIdsSeen.get(idVal);
      if (prevId) {
        errors.push({
          line: prevId.line,
          text: prevId.text,
          msg: `duplicate step id "${idVal}"`,
        });
        errors.push({ line, text, msg: `duplicate step id "${idVal}"` });
      } else {
        mergeIdsSeen.set(idVal, { line, text });
      }
      rows[lastRealStepIndex].mergeId = idVal;
      continue;
    }
    if (/^label:\s*/i.test(u)) {
      if (lastRealStepIndex >= 0) appendLineToRow(lastRealStepIndex, line);
      m = u.match(/^label:\s*(.+);\s*$/i);
      if (!m) {
        errors.push({ line, text, msg: "label: line must end with ';'" });
        continue;
      }
      if (lastRealStepIndex < 0) {
        errors.push({ line, text, msg: "label: has no preceding step" });
        continue;
      }
      rows[lastRealStepIndex].name = m[1].trim();
      continue;
    }
    if (/^desc:\s*/i.test(u)) {
      if (lastRealStepIndex < 0) {
        errors.push({ line, text, msg: "desc: has no preceding step" });
        continue;
      }
      const fenced = parseKeyedProperty(sections.line, lineIdx, "desc");
      if (fenced) {
        if (fenced.error) errors.push(fenced.error);
        else rows[lastRealStepIndex].description = fenced.value || "";
        attachSectionLinesToRow(lastRealStepIndex, lineIdx, fenced.nextIndex);
        lineIdx = fenced.nextIndex - 1;
        continue;
      }
      continue;
    }
    if (/^remark:\s*/i.test(u)) {
      if (lastRealStepIndex < 0) {
        errors.push({ line, text, msg: "remark: has no preceding step" });
        continue;
      }
      const fenced = parseKeyedProperty(sections.line, lineIdx, "remark");
      if (fenced) {
        if (fenced.error) errors.push(fenced.error);
        else rows[lastRealStepIndex].remark = fenced.value || "";
        attachSectionLinesToRow(lastRealStepIndex, lineIdx, fenced.nextIndex);
        lineIdx = fenced.nextIndex - 1;
        continue;
      }
      continue;
    }
    if (/^remark-desc:\s*/i.test(u)) {
      if (lastRealStepIndex < 0) {
        errors.push({ line, text, msg: "remark-desc: has no preceding step" });
        continue;
      }
      const fenced = parseKeyedProperty(sections.line, lineIdx, "remark-desc");
      if (fenced) {
        if (fenced.error) errors.push(fenced.error);
        else {
          const next = fenced.value || "";
          const prev = rows[lastRealStepIndex].remark || "";
          rows[lastRealStepIndex].remark = prev ? `${prev}\n\n${next}` : next;
        }
        attachSectionLinesToRow(lastRealStepIndex, lineIdx, fenced.nextIndex);
        lineIdx = fenced.nextIndex - 1;
        continue;
      }
      continue;
    }
    if (/^skip/i.test(u)) {
      if (lastRealStepIndex >= 0) appendLineToRow(lastRealStepIndex, line);
      if (!/^skip;\s*$/i.test(u)) {
        errors.push({ line, text, msg: "skip must be written as skip;" });
        continue;
      }
      if (lastRealStepIndex < 0) {
        errors.push({ line, text, msg: "skip has no preceding step" });
        continue;
      }
      rows[lastRealStepIndex].skipIndex = true;
      continue;
    }
    if (/^props:\s*/i.test(u)) {
      if (lastRealStepIndex >= 0) appendLineToRow(lastRealStepIndex, line);
      m = u.match(/^props:\s*(.+);\s*$/i);
      if (!m) {
        errors.push({ line, text, msg: "props: line must end with ';'" });
        continue;
      }
      if (lastRealStepIndex < 0) {
        errors.push({ line, text, msg: "props: has no preceding step" });
        continue;
      }
      const ids = m[1]
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      rows[lastRealStepIndex].props = ids;
      ids.forEach((id) => {
        if (!props[id]) props[id] = { id, label: id, side: "right" };
      });
      continue;
    }

    if (/^arrow:\s*/i.test(u)) {
      if (lastRealStepIndex >= 0) appendLineToRow(lastRealStepIndex, line);
      m = u.match(/^arrow:\s*(.+);\s*$/i);
      if (!m) {
        errors.push({ line, text, msg: "arrow: line must end with ';'" });
        continue;
      }
      if (lastRealStepIndex < 0) {
        errors.push({ line, text, msg: "arrow: has no preceding step" });
        continue;
      }
      const arrowVal = normalizeArrowLine(m[1].trim());
      if (!arrowVal) {
        errors.push({
          line,
          text,
          msg: `arrow: must be one of ${ARROW_LINE_TYPES.join(", ")}`,
        });
        continue;
      }
      rows[lastRealStepIndex].arrowLine = arrowVal;
      continue;
    }

    if (/^\[loop\]\s*;?\s*$/i.test(u)) {
      const top = stack[stack.length - 1];
      if (!top || top.type !== "if") {
        errors.push({ line, text, msg: "[loop] outside if" });
        continue;
      }
      pushLineRow(
        {
          kind: "branchLoop",
          loopBranchId: top.id,
          depth: branchBodyDepth(),
        },
        line,
      );
      continue;
    }

    /** `merge: <id>;` — route this case to a downstream step with matching `id:`. */
    if (/^merge:\s*/i.test(u)) {
      m = u.match(/^merge:\s*(.+);\s*$/i);
      if (!m) {
        errors.push({ line, text, msg: "merge: line must end with ';'" });
        continue;
      }
      const top = stack[stack.length - 1];
      if (!top || top.type !== "if") {
        errors.push({ line, text, msg: "merge outside if" });
        continue;
      }
      const mergeIdVal = m[1].trim();
      if (!mergeIdVal) {
        errors.push({ line, text, msg: "merge: value must not be empty" });
        continue;
      }
      pushLineRow(
        {
          kind: "branchMerge",
          mergeTarget: mergeIdVal,
          mergeBranchId: top.id,
          depth: branchBodyDepth(),
        },
        line,
      );
      continue;
    }
    if (/^merge\s+/i.test(u)) {
      errors.push({
        line,
        text,
        msg: "use merge: <id>; instead of merge <id>;",
      });
      continue;
    }

    let blockRef = null;
    let work = u;
    const blockAtEnd = u.match(/<([A-Za-z0-9_\-]+)>\s*;?\s*$/);
    if (blockAtEnd) {
      blockRef = blockAtEnd[1];
      work = u.slice(0, blockAtEnd.index).trim();
    }

    m = work.match(/^\[([A-Za-z0-9_\-]+)\s*:\s*([\s\S]+?)\]\s*;?\s*$/);
    if (m) {
      const role = m[1].trim();
      const txt = m[2].trim();
      if (!roles[role]) roles[role] = { id: role };
      const stepId = blockRef || `step-${++autoIdCounter}`;
      pushLineRow(
        {
          kind: "step",
          role,
          text: txt,
          depth: stepDepth(),
          blockRef: blockRef || null,
          stepId,
        },
        line,
      );
      lastRealStepIndex = rows.length - 1;
      continue;
    }

    if (/^[A-Za-z0-9_\-]+\s*:\s*\S/.test(work)) {
      errors.push({
        line,
        text,
        msg: "step lines must use [roleId: text] (optional <block> at end of line)",
      });
      continue;
    }

    errors.push({ line, text, msg: "unrecognized line" });
  }

  if (groupStack.length > 0) {
    const open = groupStack[groupStack.length - 1];
    const openLine = rows.find((r) => r.kind === "groupStart" && r.id === open.id);
    const lineNum = openLine?.dslLines?.[0];
    const openText = sections.line.find((l) => l.line === lineNum)?.text;
    errors.push({
      line: lineNum,
      text: openText,
      msg: "unclosed section (missing end-section)",
    });
  }

  /** Every if/fork still open at the end of /line/ is missing its closer. */
  for (const open of stack) {
    const openRow = rows.find((r) => r.kind === "branchStart" && r.id === open.id);
    const lineNum = openRow?.dslLines?.[0];
    const openText = sections.line.find((l) => l.line === lineNum)?.text;
    errors.push({
      line: lineNum,
      text: openText,
      msg: open.type === "fork" ? "unclosed fork (missing endfork)" : "unclosed if (missing endif)",
    });
  }

  /** Resolve each `merge: <id>;` to the step whose `id:` matches; error if none. */
  for (const r of rows) {
    if (r.kind !== "branchMerge") continue;
    if (!mergeIdsSeen.has(r.mergeTarget)) {
      const mergeLine = r.dslLines?.[0];
      const mergeText = sections.line.find((l) => l.line === mergeLine)?.text;
      errors.push({
        line: mergeLine,
        text: mergeText,
        msg: `merge: no step with id "${r.mergeTarget}"`,
      });
    }
  }

  const seen = new Set();
  const ordered = [];
  for (const { text: roleLine } of sections.role) {
    const m2 = roleLine.trim().match(/^<([^>]+)>$/);
    if (m2 && !seen.has(m2[1])) {
      seen.add(m2[1]);
      ordered.push(m2[1]);
    }
  }
  for (const r of rows) {
    if (r.kind === "step" && r.role && !seen.has(r.role)) {
      seen.add(r.role);
      ordered.push(r.role);
    }
  }
  const lanes = ordered.map((id) => ({
    id,
    label: (roles[id] && roles[id].label) || id,
    textColor: (roles[id] && roles[id].textColor) || null,
    bg: (roles[id] && roles[id].bg) || null,
    icon: (roles[id] && roles[id].icon) || null,
  }));

  // Comments after the last /line/ row (kept so the formatter can round-trip them).
  const trailingLineComments = pendingComments;

  return {
    title,
    page,
    options,
    providedColumnTitles: [...providedColumnTitles],
    lanes,
    rows,
    blocks,
    props,
    errors,
    trailingLineComments,
  };
}

/** Parse /block/ and /prop/ fragments (wraps for parseDSL; not for clipboard). */
export function parseDSLParts(src) {
  const body = src.trim();
  const wrapped = `@kai-swimlane\n/title/\n\n${body}\n/role/\n<__parts_preview__>\nlabel: ;\n/line/\n@end\n`;
  const model = parseDSL(wrapped);
  return {
    blocks: model.blocks,
    props: model.props,
    errors: model.errors,
  };
}
