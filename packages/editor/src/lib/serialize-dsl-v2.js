/**
 * kai-swimlane-v2 serializer (model → canonical v2 DSL text).
 *
 * A parallel write-side counterpart to parser-v2.js's grammar. Every declared
 * language is written back: the source (first-declared) language as the bare
 * key, every other language that has its own `<field>$langs` entry as a
 * `key.tag:` follow-up property — for fields the grammar actually routes
 * through a follow-up property line (page/*, role/block/prop `label` and
 * prop `title`, step `name`/`description`/`remark`). Fields with no such
 * follow-up path (title, step bracket text, if/case/fork condition and
 * labels, section/branch/phase names) are always written as one inline
 * `a | b` run instead — the only form `parser-v2.js`'s `pickSegment` ever
 * reads for them.
 *
 * Not attempted here (see the swimlane-cloud plan's "Part 2" non-goals): the
 * `/i18n/` catalog is written back byte-for-byte from `model.catalog`, but
 * its spec'd fallback-resolution chain isn't implemented anywhere, so this
 * is a passthrough, not a real feature; `/option/` keys the parser already
 * recognizes but discards (`i18n-uniform-layout` and friends) stay discarded;
 * an `unset:` that only makes sense because an id was also `@use`d from a
 * fragment can't survive a round-trip once that id is locally reopened for
 * an unrelated field, since the model has no per-field provenance — unused
 * by any real fixture in this repo, so left as a known gap.
 */
import {
  DEFAULT_COLUMN_TITLES,
  DIAGRAM_OPTION_DSL_MAP,
  OPTION_COLUMN_TITLE_DSL_MAP,
} from "@swimlane-cloud/diagram-converter/diagram-options";

// The parser's tokenizer marks every unescaped `|`/`｜` with this byte before
// any field decides whether it's actually translatable — a value that never
// goes through `seg()` (meta, and a few other non-translatable properties)
// can still carry a stray one. Never write this raw byte into a file; when a
// value wasn't run through `escapeBarSegment` (which already turns a real
// literal bar back into `\|`), fall back to a lossy but always-safe swap.
const RAW_SEG_MARKER = String.fromCharCode(0);
function sanitizeStrayMarker(value) {
  return typeof value === "string" && value.includes(RAW_SEG_MARKER)
    ? value.replaceAll(RAW_SEG_MARKER, "|")
    : value;
}

function emitProperty(key, value) {
  if (value == null || value === "") return null;
  return `${key}: ${sanitizeStrayMarker(value)};`;
}

function emitMultilineProperty(key, value) {
  if (value == null || value === "") return null;
  const safe = sanitizeStrayMarker(String(value));
  if (!safe.includes("\n")) return `${key}: ${safe};`;
  return [`${key}: \`\`\``, ...safe.split("\n"), "```;"];
}

/** Like `emitMultilineProperty`, but for a value from a translatable field —
 * a single-line value needs its literal bars escaped first, since every
 * translatable position splits on an unescaped one; a fenced (multi-line)
 * value never goes through bar-splitting at all, so it's left alone. */
function emitLocalizedValue(key, value) {
  if (value == null || value === "") return null;
  const str = String(value);
  if (str.includes("\n")) return emitMultilineProperty(key, str);
  return emitProperty(key, escapeBarSegment(str));
}

function pushLines(out, lines) {
  if (!lines) return;
  if (Array.isArray(lines)) out.push(...lines);
  else out.push(lines);
}

/** Escape what a bar-joined multi-language run cannot carry unescaped. */
function escapeBarSegment(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/｜/g, "\\｜");
}

/**
 * One value for a bar-only field (title, step text, if/case/fork condition
 * and labels, section/branch/phase names): `value` alone when every
 * language shares it, or every declared language positionally joined with
 * ` | ` up to the last one that has its own override.
 */
function joinLangs(value, langsArr, languageCount) {
  // Bar-splitting is unconditional in every translatable position regardless
  // of how many languages are declared, so a literal bar always needs
  // escaping here — even with one language (or none), an unescaped one would
  // still split the value on reparse and silently drop everything after it.
  if (languageCount <= 1) return escapeBarSegment(value ?? "");
  // Index 0 (the source/active language) always comes from the flattened
  // field, never from `$langs[0]` — every existing mutation path (GUI mode
  // today has no per-language editing UI yet) only ever touches the
  // flattened field, so trusting a stale `$langs[0]` here would silently
  // discard that edit on the next save.
  let lastIdx = 0;
  if (langsArr) {
    for (let i = 1; i < langsArr.length; i++) if (langsArr[i] !== undefined) lastIdx = i;
  }
  if (lastIdx === 0) return escapeBarSegment(value ?? "");
  const parts = [];
  for (let i = 0; i <= lastIdx; i++) {
    const v = i === 0 ? (value ?? "") : langsArr && langsArr[i] !== undefined ? langsArr[i] : "";
    parts.push(escapeBarSegment(v));
  }
  return parts.join(" | ");
}

/**
 * `key: <source>;` plus a `key.tag: <value>;` follow-up for every other
 * declared language that has its own override — for fields the grammar
 * actually reads a `.tag` follow-up property for.
 */
function emitLocalizedTag(key, value, langsArr, languages) {
  const out = [];
  const n = languages.length;
  // Index 0 (the source/active language) always comes from the flattened
  // field, never from `$langs[0]` — see the identical note on `joinLangs`.
  pushLines(out, emitLocalizedValue(key, value));
  if (n > 1 && langsArr) {
    for (let i = 1; i < n; i++) {
      if (langsArr[i] === undefined) continue;
      pushLines(out, emitLocalizedValue(`${key}.${languages[i]}`, langsArr[i]));
    }
  }
  return out;
}

function hasPageContent(page) {
  if (!page) return false;
  return Object.values(page).some((v) => v && String(v).trim());
}

// The four gutter titles (left-title, left-subtitle, right-title,
// right-subtitle) are NOT here even though parser-v2.js's PAGE_MAP accepts
// them under /page/ too — they're written under /option/ instead, via
// serializeOption below, because that's the only spelling that carries the
// DEFAULT_COLUMN_TITLES default-suppression logic (skip the entry entirely
// unless it was explicitly provided or differs from the default).
const PAGE_ENTRIES = [
  ["description", "description"],
  ["header-left", "headerLeft"],
  ["header-center", "headerCenter"],
  ["header-right", "headerRight"],
  ["footer-left", "footerLeft"],
  ["footer-center", "footerCenter"],
  ["footer-right", "footerRight"],
];

function serializePage(page, languages) {
  const out = [];
  for (const [key, field] of PAGE_ENTRIES) {
    out.push(...emitLocalizedTag(key, page[field], page[`${field}$langs`], languages));
  }
  return out;
}

function serializeOption(model, languages) {
  const out = [];
  const options = model.options || {};
  for (const [dslKey, field] of Object.entries(DIAGRAM_OPTION_DSL_MAP)) {
    if (options[field] !== undefined) out.push(`${dslKey}: ${options[field]};`);
  }
  const page = model.page || {};
  const provided = new Set(model.providedColumnTitles || []);
  for (const [dslKey, field] of Object.entries(OPTION_COLUMN_TITLE_DSL_MAP)) {
    const val = page[field] ?? DEFAULT_COLUMN_TITLES[field];
    if (provided.has(field) || val !== DEFAULT_COLUMN_TITLES[field]) {
      out.push(...emitLocalizedTag(dslKey, val, page[`${field}$langs`], languages));
    }
  }
  return out;
}

function serializeMeta(meta) {
  const out = [];
  for (const [key, value] of Object.entries(meta || {})) {
    pushLines(out, emitMultilineProperty(key, value));
  }
  return out;
}

function serializeCatalog(catalog) {
  const out = [];
  for (const [key, value] of Object.entries(catalog || {})) {
    pushLines(out, emitMultilineProperty(key, value));
  }
  return out;
}

function serializeDef(id, def, languages, extraProps) {
  const lines = [`<${id}>`];
  for (const line of extraProps(def)) lines.push(line);
  lines.push(...emitLocalizedTag("label", def.label, def[`label$langs`], languages));
  return lines;
}

function serializeRole(id, role, languages) {
  return serializeDef(id, role, languages, (r) =>
    [
      emitProperty("text-color", r.textColor),
      emitProperty("background-color", r.bg),
      emitProperty("icon", r.icon),
    ].filter(Boolean),
  );
}

function serializeBlock(id, block, languages) {
  return serializeDef(id, block, languages, (b) =>
    [
      emitProperty("background-color", b.bg),
      emitProperty("text-color", b.textColor),
      emitProperty("border-color", b.borderColor),
      emitProperty("shape", b.shape),
      emitProperty("icon", b.icon),
    ].filter(Boolean),
  );
}

function serializeProp(id, prop, languages) {
  return [
    `<${id}>`,
    ...[
      emitProperty("side", prop.side),
      emitProperty("background-color", prop.bg),
      emitProperty("border-color", prop.borderColor),
      emitProperty("text-color", prop.textColor),
      emitProperty("max-chars", prop.maxChars != null ? String(prop.maxChars) : null),
    ].filter(Boolean),
    ...emitLocalizedTag("label", prop.label, prop[`label$langs`], languages),
    ...emitLocalizedTag("title", prop.title, prop[`title$langs`], languages),
  ];
}

const INDENT = "  ";
function indent(depth, line) {
  return INDENT.repeat(Math.max(0, depth ?? 0)) + line;
}
function pushBlankLine(out) {
  if (out.length > 0 && out[out.length - 1] !== "") out.push("");
}

function branchControlDepth(rows, rowIndex) {
  const row = rows[rowIndex];
  if (row.kind === "branchStart") return row.depth ?? 0;
  if (row.kind === "branchCase" || row.kind === "branchEnd") {
    for (let j = rowIndex; j >= 0; j--) {
      if (rows[j].kind === "branchStart" && rows[j].id === row.id) return rows[j].depth ?? 0;
    }
  }
  return row.depth ?? 0;
}

function serializeBranchColor(color) {
  return color ? ` #${color}` : "";
}

/** True for the branchCase a fork's own opener line already names as its label. */
function isForkFirstCase(rows, i) {
  const row = rows[i];
  if (row.kind !== "branchCase" || !row.parallel) return false;
  const prev = rows[i - 1];
  return !!prev && prev.kind === "branchStart" && prev.parallel && prev.id === row.id;
}

/**
 * True for the branchCase an `if`'s blank `firstCase` has already been
 * pulled out into — `normalizeBranchRows` (`flow-rows.js`) does exactly this
 * so the GUI can treat a branch's first case like any other row, and
 * `applyModelEdit` always re-normalizes before calling back in here. Same
 * adjacency shape as `isForkFirstCase`, and the same inherent ambiguity the
 * v1 serializer's `isFirstBranchCaseRow` already accepts: a genuinely blank
 * `case ()` immediately followed by a second case with zero steps between
 * them is indistinguishable from an extraction. Rare enough to accept.
 */
function isExtractedFirstCase(rows, i) {
  const row = rows[i];
  if (row.kind !== "branchCase" || row.parallel) return false;
  const prev = rows[i - 1];
  return (
    !!prev &&
    prev.kind === "branchStart" &&
    !prev.parallel &&
    prev.id === row.id &&
    !(prev.firstCase || "").trim()
  );
}

function serializeStepLines(out, row, depth, languages) {
  if (row.empty) {
    out.push(indent(depth, "[]"));
    return;
  }
  const suffixes = [];
  if (row.blockRef) suffixes.push(`<${row.blockRef}>`);
  // `stepId` is always populated (auto-generated when the source gave no
  // `@id`); `mergeId` is only set when one was actually authored — writing
  // the auto-generated one back would turn it into a real id on reparse.
  if (row.mergeId) suffixes.push(`@${row.mergeId}`);
  if (row.props?.length) for (const p of row.props) suffixes.push(`+${p}`);
  if (row.link) suffixes.push(`=> ${row.link}`);
  if (row.arrowLine && row.arrowLine !== "solid") {
    const glyph = { dashed: "~>", dotted: "..>", "dash-dot": "-.>", "long-dash": "-->" }[
      row.arrowLine
    ];
    if (glyph) suffixes.push(glyph);
  }
  const suffix = suffixes.length ? ` ${suffixes.join(" ")}` : "";
  const text = joinLangs(row.text, row.text$langs, languages.length);
  out.push(indent(depth, `[${row.role}: ${text}]${suffix}`));
  const label = emitLocalizedTag("label", row.name, row.name$langs, languages);
  for (const l of label) out.push(indent(depth + 1, l));
  const desc = emitLocalizedTag("desc", row.description, row.description$langs, languages);
  for (const l of desc) out.push(indent(depth + 1, l));
  const remark = emitLocalizedTag("remark", row.remark, row.remark$langs, languages);
  for (const l of remark) out.push(indent(depth + 1, l));
  if (row.skipIndex) out.push(indent(depth + 1, "skip;"));
}

function serializeLineRows(rows, languages) {
  const out = [];
  let prevKind = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const depth = row.depth ?? 0;
    const controlDepth = branchControlDepth(rows, i);

    if (row.leadingComments?.length) {
      const isMarker = [
        "branchStart",
        "branchCase",
        "branchEnd",
        "groupStart",
        "groupEnd",
      ].includes(row.kind);
      const commentIndent = isMarker ? controlDepth : depth;
      if (out.length > 0 && out[out.length - 1] !== "") pushBlankLine(out);
      for (const c of row.leadingComments) out.push(indent(commentIndent, c));
      prevKind = "comment";
    }

    if (row.kind === "branchStart") {
      if (prevKind === "branchEnd" || (prevKind === "step" && depth === 0)) pushBlankLine(out);
      const color = serializeBranchColor(row.branchColor);
      const idSuffix = row.openerId ? ` @${row.openerId}` : "";
      if (row.parallel) {
        // The fork's own opening text is the first path's label — modelled
        // as a real (adjacent) branchCase row, not specially on branchStart
        // the way an if's first case is.
        const firstPath = isForkFirstCase(rows, i + 1) ? rows[i + 1] : null;
        const label = firstPath
          ? joinLangs(firstPath.label, firstPath.label$langs, languages.length)
          : "";
        out.push(indent(controlDepth, `fork (${label})${idSuffix}${color}`));
      } else {
        const lane = row.lane ? `[${row.lane}] ` : "";
        const cond = joinLangs(row.cond, row.cond$langs, languages.length);
        out.push(indent(controlDepth, `if ${lane}(${cond})${idSuffix}${color}`));
        // A GUI-normalized model already pulled a non-blank firstCase out
        // into its own row — fold it back into the case() line here either
        // way, so this works on both a raw parse and an edited/normalized
        // one (see isExtractedFirstCase).
        const extracted = isExtractedFirstCase(rows, i + 1) ? rows[i + 1] : null;
        const firstCase = extracted
          ? joinLangs(extracted.label, extracted.label$langs, languages.length)
          : joinLangs(row.firstCase, row.firstCase$langs, languages.length);
        out.push(indent(controlDepth, `case (${firstCase})`));
      }
      prevKind = "branchStart";
      continue;
    }

    if (row.kind === "branchCase") {
      if (row.parallel && isForkFirstCase(rows, i)) {
        prevKind = "branchCase";
        continue;
      }
      if (!row.parallel && isExtractedFirstCase(rows, i)) {
        prevKind = "branchCase";
        continue;
      }
      pushBlankLine(out);
      const color = serializeBranchColor(row.branchColor);
      const label = joinLangs(row.label, row.label$langs, languages.length);
      out.push(
        indent(controlDepth, row.parallel ? `and (${label})${color}` : `case (${label})${color}`),
      );
      prevKind = "branchCase";
      continue;
    }

    if (row.kind === "branchEnd") {
      out.push(indent(controlDepth, row.parallel ? "end-fork" : "end-if"));
      prevKind = "branchEnd";
      const next = rows[i + 1];
      if (
        next &&
        (next.kind === "branchStart" ||
          (next.kind === "step" && !next.empty && (next.depth ?? 0) <= depth))
      ) {
        pushBlankLine(out);
      }
      continue;
    }

    if (row.kind === "branchLoop") {
      out.push(indent(depth, row.loopTarget ? `loop @${row.loopTarget}` : "loop"));
      prevKind = "branchLoop";
      continue;
    }

    if (row.kind === "branchMerge") {
      out.push(indent(depth, `goto @${row.mergeTarget}`));
      prevKind = "branchMerge";
      continue;
    }

    if (row.kind === "groupStart") {
      if (depth === 0 && prevKind === "step") pushBlankLine(out);
      const kw = row.openerKeyword || (row.groupMode === "branch" ? "branch" : "section");
      const defaultName = row.groupMode === "branch" ? "Branch" : "Section";
      const name = joinLangs(row.sectionName, row.sectionName$langs, languages.length);
      const namePart = name && name !== defaultName ? ` (${name})` : "";
      const idSuffix = row.openerId ? ` @${row.openerId}` : "";
      const color = row.sectionColor ? ` #${row.sectionColor}` : "";
      out.push(indent(depth, `${kw}${namePart}${idSuffix}${color}`));
      prevKind = "groupStart";
      continue;
    }

    if (row.kind === "groupEnd") {
      const kw = row.openerKeyword || (row.groupMode === "branch" ? "branch" : "section");
      out.push(indent(depth, `end-${kw}`));
      prevKind = "groupEnd";
      const next = rows[i + 1];
      if (next && next.kind === "step" && !next.empty && (next.depth ?? 0) <= depth) {
        pushBlankLine(out);
      }
      continue;
    }

    if (row.kind === "step") {
      if (prevKind === "step" && !row.empty) pushBlankLine(out);
      serializeStepLines(out, row, depth, languages);
      prevKind = "step";
    }
  }

  return out;
}

export function serializeDSLv2(model) {
  const languages = Array.isArray(model.languages) ? model.languages : [];
  const localDefIds = model.localDefIds || { role: [], block: [], prop: [] };
  const lines = ["@kai-swimlane-v2"];

  if (languages.length > 0) lines.push(`@lang ${languages.join(", ")};`);
  for (const use of model.uses || []) {
    lines.push(use.alias ? `@use ${use.path} as ${use.alias};` : `@use ${use.path};`);
  }
  lines.push("");

  const metaLines = serializeMeta(model.meta);
  if (metaLines.length > 0) {
    lines.push("/meta/");
    lines.push(...metaLines);
    lines.push("");
  }

  if (hasPageContent(model.page)) {
    lines.push("/page/");
    lines.push(...serializePage(model.page, languages));
    lines.push("");
  }

  lines.push("/title/");
  lines.push(`${joinLangs(model.title, model.title$langs, languages.length)};`);
  lines.push("");

  const optionLines = serializeOption(model, languages);
  if (optionLines.length > 0) {
    lines.push("/option/");
    lines.push(...optionLines);
    lines.push("");
  }

  const roleIds = (localDefIds.role || []).filter((id) => model.roles?.[id]);
  if (roleIds.length > 0) {
    lines.push("/role/");
    lines.push("");
    for (const id of roleIds) {
      lines.push(...serializeRole(id, model.roles[id], languages));
      lines.push("");
    }
  }

  const blockIds = (localDefIds.block || []).filter((id) => model.blocks?.[id]);
  if (blockIds.length > 0) {
    lines.push("/block/");
    lines.push("");
    for (const id of blockIds) {
      lines.push(...serializeBlock(id, model.blocks[id], languages));
      lines.push("");
    }
  }

  const propIds = (localDefIds.prop || []).filter((id) => model.props?.[id]);
  if (propIds.length > 0) {
    lines.push("/prop/");
    lines.push("");
    for (const id of propIds) {
      lines.push(...serializeProp(id, model.props[id], languages));
      lines.push("");
    }
  }

  const catalogLines = serializeCatalog(model.catalog);
  if (catalogLines.length > 0) {
    lines.push("/i18n/");
    lines.push(...catalogLines);
    lines.push("");
  }

  lines.push("/line/");
  lines.push("");
  lines.push(...serializeLineRows(model.rows || [], languages));
  const trailing = model.trailingLineComments || [];
  if (trailing.length > 0) {
    if (lines[lines.length - 1] !== "") lines.push("");
    for (const c of trailing) lines.push(c);
  }
  lines.push("");
  lines.push("@end");

  return lines.join("\n");
}
