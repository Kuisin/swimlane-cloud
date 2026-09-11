/**
 * Markdown as a storage format for a diagram.
 *
 * A diagram may live in a `.md` file rather than a `.txt` one: frontmatter
 * carrying its metadata, ordinary prose, and the DSL inside a fenced
 * ```` ```kai-swimlane ```` block. `utils.js`'s `TEMPLATE_FENCE_RE` already
 * recognises the same fence for templates — this module is the read/write
 * half of that idea.
 *
 * ## Frontmatter is the source of truth
 *
 * Metadata lives in the `.md`'s own `---` block and nowhere else: portable,
 * visible on GitHub, versioned with the content. A value is
 * `string | string[] | { [key]: value }` recursively — scalars, lists and
 * nested maps, all of them readable *and* writable.
 *
 * ## `/meta/` is a projection, not the carrier
 *
 * The DSL's `/meta/` section is `key: value;` lines. It has no syntax for a
 * nested map and the grammar is not changing, so the fence can only ever hold
 * *part* of the model. Hence:
 *
 * - `dslFromMarkdown` injects the **projectable** keys only — a string, or a
 *   list whose items survive being comma-joined and split apart again (no empty
 *   item, no item containing a comma). A nested map, an empty list, a list with
 *   a comma in an item, and anything kept `verbatim` never reach the fence.
 * - `markdownFromDsl` merges `/meta/` back **over** the previous document's
 *   frontmatter model. A key in `/meta/` updates that key; every other
 *   frontmatter key is preserved untouched.
 * - **Deletion rule:** a key missing from `/meta/` is removed only if it was
 *   *eligible to be projected in the first place* — that is, only if the
 *   previous document's value for it was projectable. Editing the fence can
 *   therefore delete `owner` (a scalar the fence could see) but can never
 *   delete `sourceRef` (a nested map the fence never saw), because its absence
 *   from `/meta/` carries no information about the author's intent.
 *
 * Break that rule and every round trip through the DSL silently strips the rich
 * half of the metadata. It is the subtle part of this module.
 *
 * ## Shapes, and the verbatim fallback
 *
 * `splitFrontmatter` records how each key was *written* — quoting, block vs
 * flow list style, indentation, author key order — so `serializeFrontmatter`
 * writes it back the same way and an untouched save is a zero-byte diff. Every
 * key is round-trip-checked at parse time: if re-emitting the parsed value does
 * not reproduce the source lines exactly, the key falls back to `verbatim` and
 * is carried through byte-for-byte (uneditable, but never mangled). Block
 * scalars (`|`, `>`), flow maps (`{…}`), anchors, aliases and tags are refused
 * up front and always land there.
 *
 * That check is what makes `markdownFromDsl(dslFromMarkdown(md)) === md` hold
 * for documents this module does not fully understand.
 */

const FENCE_LANG = "kai-swimlane";

/** Every section marker, in the canonical order of dsl-rule.md:324. */
const SECTION_MARKERS = [
  "/meta/",
  "/title/",
  "/page/",
  "/option/",
  "/role/",
  "/block/",
  "/prop/",
  "/line/",
  "/i18n/",
];

/** `/meta/`'s five reserved keys, in the order dsl-rule.md:376 serialises them. */
const META_KEY_ORDER = ["owner", "status", "tags", "version", "updated"];

const FRONTMATTER_DELIM = "---";

/* ────────────────────────────── frontmatter ────────────────────────────── */

/** True when a bare value would not survive a round-trip unquoted. */
function needsQuoting(value) {
  if (value === "") return true;
  if (value !== value.trim()) return true;
  if (/[\n\r]/.test(value)) return true;
  if (value.startsWith('"')) return true;
  // `: ` (and a trailing `:`) end a key in YAML, so a plain scalar cannot hold
  // one — quote it, or GitHub and every other reader disagrees with us about
  // where this value stops.
  if (value.includes(": ") || value.endsWith(":")) return true;
  // Leading characters YAML gives a meaning to, so other tools read it as we do.
  return "#-[]{}&*!|>%@`,?:'".includes(value[0]);
}

function quote(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function unquote(value) {
  const inner = value.slice(1, -1);
  let out = "";
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] !== "\\") {
      out += inner[i];
      continue;
    }
    const next = inner[++i];
    out += next === "n" ? "\n" : next === undefined ? "\\" : next;
  }
  return out;
}

/** True when `raw` is a double-quoted scalar as written in the source. */
function isQuoted(raw) {
  return raw.length > 1 && raw.startsWith('"') && raw.endsWith('"');
}

function scalar(raw) {
  return isQuoted(raw) ? unquote(raw) : raw;
}

/**
 * The text for one value: quoted when it has to be, and also when the author
 * wrote it quoted — a gratuitous pair of quotes is still the author's choice,
 * and rewriting it away would turn every save into a diff.
 */
function emitScalar(value, wasQuoted) {
  return needsQuoting(value) || wasQuoted ? quote(value) : value;
}

/** Meta keys in canonical order: the five reserved ones, then the rest sorted. */
export function orderedMetaKeys(meta) {
  const keys = Object.keys(meta ?? {});
  const reserved = META_KEY_ORDER.filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !META_KEY_ORDER.includes(k)).sort();
  return [...reserved, ...rest];
}

/**
 * The separator a list flattens to for `/meta/`. It matches what `/meta/`
 * already does with `tags`, so a list reads the same way everywhere downstream.
 */
const LIST_SEP = ", ";

/** Items of a flattened list, or null when it cannot be one item per element. */
function listItems(value) {
  const items = String(value)
    .split(",")
    .map((s) => s.trim());
  return items.every(Boolean) ? items : null;
}

/**
 * True when these items survive being joined into one comma-separated scalar
 * and split apart again — which is the only reason a list can be flattened.
 */
function flattenable(items) {
  return items.length > 0 && items.every((v) => v && !v.includes(","));
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/* ───────────────────────────── writing YAML ────────────────────────────── */

/**
 * A key as it has to be written.
 *
 * A key is author-supplied now that a form can add one, so it gets the same
 * care as a value. Any `:` at all has to be quoted, not just a `: ` — YAML
 * reads `a:b: v` as the key `a:b`, and writing it bare would hand the next
 * reader a different key and silently lose the value. A leading `-` would make
 * the line a sequence entry, and an empty key is not a key at all.
 */
function emitMapKey(key, wasQuoted) {
  return needsQuoting(key) || key.includes(":") || wasQuoted ? quote(key) : key;
}

/**
 * The lines for one key, at `indent`.
 *
 * `how` is the shape `splitFrontmatter` recorded for it; without one the value
 * decides — a string is a scalar, an array a block sequence, an object a
 * nested map.
 */
function emitKey(rawKey, value, how, indent) {
  if (how?.kind === "verbatim") return how.lines;
  const key = emitMapKey(String(rawKey), how?.quotedKey === true);

  // A caller that has not moved to the array model may still hand a list key
  // its old comma-joined string. Honour it, so nothing that worked before
  // silently turns a list into a scalar.
  let v = value;
  if (typeof v === "string" && (how?.kind === "list" || how?.kind === "flowList")) {
    const items = listItems(v);
    if (items) v = items;
  }

  if (Array.isArray(v)) {
    const items = v.map((item) => String(item));
    const quoted = how?.quoted ?? [];
    const wasQuoted = (item) => quoted.includes(item);
    if (how?.kind === "flowList" || items.length === 0) {
      const inner = items.map((item) => emitScalar(item, wasQuoted(item))).join(LIST_SEP);
      return [`${indent}${key}: [${inner}]`];
    }
    const itemIndent = how?.indent ?? `${indent}  `;
    return [
      `${indent}${key}:`,
      ...items.map((item) => `${itemIndent}- ${emitScalar(item, wasQuoted(item))}`),
    ];
  }

  if (isPlainObject(v)) {
    const childIndent = how?.kind === "map" ? how.indent : `${indent}  `;
    const childShape = how?.kind === "map" ? how.shape : new Map();
    const body = emitMap(v, childShape, childIndent);
    if (!body.length) return [`${indent}${key}: {}`];
    return [`${indent}${key}:`, ...body];
  }

  const text = v === undefined || v === null ? "" : String(v);
  // `key:` with nothing after it, as the author wrote it. Only an empty value
  // may keep that form — anything else has something to say.
  if (text === "" && how?.blank) return [`${indent}${key}:`];
  return [`${indent}${key}: ${emitScalar(text, how?.quoted === true)}`];
}

/**
 * Every key of one mapping, in the order `kept` remembers, then whatever is
 * new in canonical order.
 *
 * A `verbatim` key has no value to carry, so it is kept whenever its shape is —
 * dropping it would delete a line this module merely failed to understand.
 */
function emitMap(values, kept, indent) {
  const all = { ...values };
  for (const [key, how] of kept) if (how.kind === "verbatim" && !(key in all)) all[key] = "";
  const known = [...kept.keys()].filter((k) => k in all);
  const added = Object.keys(all).filter((k) => !kept.has(k));
  const keys = [...known, ...orderedMetaKeys(Object.fromEntries(added.map((k) => [k, all[k]])))];

  const lines = [];
  for (const key of keys) lines.push(...emitKey(key, values[key], kept.get(key), indent));
  return lines;
}

/**
 * The `---` block for `meta`, including its trailing newline, or `""` when
 * there is no metadata to write.
 *
 * `shape` is the map `splitFrontmatter` returned for the document this metadata
 * came from. It is what re-emits a block sequence as a block sequence, what puts
 * a value this module never modelled back exactly as it was found, and — since
 * it is ordered — what keeps the author's key order. Only a document with no
 * previous shape to follow is ordered canonically; rewriting an existing file's
 * keys into `orderedMetaKeys` order would turn every save into a large diff.
 */
export function serializeFrontmatter(meta, shape) {
  const lines = emitMap(meta ?? {}, shape instanceof Map ? shape : new Map(), "");
  if (!lines.length) return "";
  return `${FRONTMATTER_DELIM}\n${lines.join("\n")}\n${FRONTMATTER_DELIM}\n`;
}

/* ───────────────────────────── reading YAML ────────────────────────────── */

/** `|`, `>` and their chomping/indentation variants: the value is the block below. */
const BLOCK_SCALAR = /^[|>][-+]?\d*$/;

/** `[a, b]` written inline — the same list, in YAML's flow style. */
const FLOW_SEQUENCE = /^\[(.*)\]$/;

/** A block-sequence entry: `- ` and the rest of the line. */
const SEQUENCE_ENTRY = /^-(\s|$)/;

/**
 * Inline forms YAML reads as something other than a plain string. Quoting one
 * of these would change what it means, so its key is kept verbatim instead.
 */
function isOpaqueInline(raw) {
  return BLOCK_SCALAR.test(raw) || raw.startsWith("{") || "&*!".includes(raw[0]);
}

function indentOf(line) {
  return /^[ \t]*/.exec(line)[0];
}

/**
 * The string a single item holds, or null when it is not a plain scalar at all
 * — a nested mapping, a nested sequence, a block scalar, an anchor.
 */
function plainScalar(raw) {
  if (isQuoted(raw)) return unquote(raw);
  if (!raw) return null;
  if (isOpaqueInline(raw)) return null;
  if (raw.startsWith("[")) return null;
  // `a: b` under a `- ` is a mapping, not a string containing a colon.
  if (raw.includes(": ") || raw.endsWith(":")) return null;
  return raw;
}

/** Split `a, "b, c", d` on its top-level commas, leaving quoted runs alone. */
function splitTopLevel(text) {
  const parts = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes && c === "\\") {
      current += c + (text[++i] ?? "");
      continue;
    }
    if (c === '"') inQuotes = !inQuotes;
    if (c === "," && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts;
}

/** `{ items, quoted }` for the inside of a `[…]`, or null when it is nested. */
function flowItems(inner) {
  if (!inner.trim()) return { items: [], quoted: [] };
  const items = [];
  const quoted = [];
  for (const part of splitTopLevel(inner)) {
    const raw = part.trim();
    const value = plainScalar(raw);
    if (value === null) return null;
    items.push(value);
    if (isQuoted(raw)) quoted.push(value);
  }
  return { items, quoted };
}

/** `{ items, quoted }` for a run of `- item` lines, or null when it is not one. */
function blockItems(lines, indent) {
  const items = [];
  const quoted = [];
  for (const line of lines) {
    if (indentOf(line) !== indent) return null;
    const rest = line.slice(indent.length);
    if (!SEQUENCE_ENTRY.test(rest)) return null;
    const raw = rest.slice(1).trim();
    const value = plainScalar(raw);
    if (value === null) return null;
    items.push(value);
    if (isQuoted(raw)) quoted.push(value);
  }
  return items.length ? { items, quoted } : null;
}

/**
 * The lines a key owns: everything indented under it, plus a block sequence
 * written at the key's own indentation (which YAML allows and which real
 * documents use).
 */
function ownedLines(lines, from, indent) {
  const owned = [];
  for (let j = from; j < lines.length; j++) {
    const line = lines[j];
    if (!line.trim()) break;
    const ind = indentOf(line);
    if (ind.length > indent.length && ind.startsWith(indent)) {
      owned.push(line);
      continue;
    }
    if (ind === indent && SEQUENCE_ENTRY.test(line.slice(indent.length))) {
      owned.push(line);
      continue;
    }
    break;
  }
  return owned;
}

const VERBATIM = Symbol("verbatim");

/** The value and shape for one key, or `VERBATIM` when it cannot be modelled. */
function parseEntry(line, cut, owned, indent) {
  const inline = line.slice(cut + 1).trim();

  if (inline) {
    // `key: value` with more lines indented under it is a shape with no model
    // here; keeping it verbatim is what stops those lines being dropped.
    if (owned.length) return VERBATIM;
    const flow = FLOW_SEQUENCE.exec(inline);
    if (flow) {
      const parts = flowItems(flow[1]);
      if (!parts) return VERBATIM;
      return { value: parts.items, how: { kind: "flowList", quoted: parts.quoted } };
    }
    if (isOpaqueInline(inline)) return VERBATIM;
    return { value: scalar(inline), how: { kind: "scalar", quoted: isQuoted(inline) } };
  }

  if (!owned.length) return { value: "", how: { kind: "scalar", blank: true } };

  const childIndent = indentOf(owned[0]);
  const seq = blockItems(owned, childIndent);
  if (seq) {
    return { value: seq.items, how: { kind: "list", indent: childIndent, quoted: seq.quoted } };
  }

  const nested = parseMapBlock(owned, childIndent);
  if (!nested.shape.size) return VERBATIM;
  // A sequence of mappings (`- x: 1`) re-reads as a mapping whose keys are
  // `- x`. It round-trips, but those are not keys anyone can edit, so the whole
  // value goes through verbatim instead.
  for (const key of nested.shape.keys()) if (SEQUENCE_ENTRY.test(key)) return VERBATIM;
  return { value: nested.values, how: { kind: "map", indent: childIndent, shape: nested.shape } };
}

/**
 * The key a mapping line opens with, and the index of the `:` that ends it, or
 * null when the line opens no key at all.
 *
 * A quoted key is read as one unit: `"a: b": v` names the key `a: b`, and
 * cutting at the first `:` the way an unquoted line is cut would name `"a`
 * instead and lose the value. It is the only form that can carry a key
 * containing a colon, which is why `emitMapKey` writes one.
 */
function readMapKey(line, indent) {
  const body = line.slice(indent.length);
  if (body.startsWith('"')) {
    let i = 1;
    for (; i < body.length; i++) {
      if (body[i] === "\\") i++;
      else if (body[i] === '"') break;
    }
    if (i >= body.length || body[i + 1] !== ":") return null;
    return { key: unquote(body.slice(0, i + 1)), cut: indent.length + i + 1, quoted: true };
  }
  const cut = line.indexOf(":");
  if (cut < 0) return null;
  const key = line.slice(0, cut).trim();
  return key ? { key, cut, quoted: false } : null;
}

/**
 * Parse one mapping — the whole frontmatter block, or the body of a nested key.
 *
 * Every key is re-emitted and compared against the lines it came from. Anything
 * that does not reproduce them exactly becomes `verbatim`, which is what lets
 * the parser above be liberal without ever risking a mangled document.
 */
function parseMapBlock(lines, indent) {
  const values = {};
  const shape = new Map();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (indentOf(line) !== indent) continue;
    const found = readMapKey(line, indent);
    if (!found) continue;
    const { key, cut } = found;

    const owned = ownedLines(lines, i + 1, indent);
    i += owned.length;

    const source = [line, ...owned];
    const parsed = parseEntry(line, cut, owned, indent);
    if (parsed !== VERBATIM && found.quoted) parsed.how.quotedKey = true;
    if (
      parsed !== VERBATIM &&
      emitKey(key, parsed.value, parsed.how, indent).join("\n") === source.join("\n")
    ) {
      values[key] = parsed.value;
      shape.set(key, parsed.how);
      continue;
    }
    shape.set(key, { kind: "verbatim", lines: source });
  }

  return { values, shape };
}

/**
 * Split a leading `---` frontmatter block off `md`.
 *
 * Only a block at the very start counts; a `---` later in the document is an
 * ordinary thematic break and is left in `body`.
 *
 * `meta` holds every key this module can model — a string, a list of strings,
 * or a nested map of the same. A key it cannot model is absent from `meta` and
 * present in `shape` as `verbatim`; `verbatimKeys(shape)` lists them, for a UI
 * that wants to show what it may not edit.
 */
export function splitFrontmatter(md) {
  const text = String(md ?? "");
  const lines = text.split("\n");
  const none = { meta: {}, body: text, hadFrontmatter: false, shape: new Map() };
  if (lines[0]?.trim() !== FRONTMATTER_DELIM) return none;

  const end = lines.findIndex((l, i) => i > 0 && l.trim() === FRONTMATTER_DELIM);
  if (end < 0) return none;

  const { values, shape } = parseMapBlock(lines.slice(1, end), "");
  return { meta: values, body: lines.slice(end + 1).join("\n"), hadFrontmatter: true, shape };
}

/** The keys `shape` carries through untouched: present in the file, uneditable. */
export function verbatimKeys(shape) {
  if (!(shape instanceof Map)) return [];
  return [...shape].filter(([, how]) => how.kind === "verbatim").map(([key]) => key);
}

/* ───────────────────────────────── fences ──────────────────────────────── */

/**
 * A fence long enough to hold `code`. The DSL can itself contain a ```` ``` ````
 * fenced `desc:` value, and CommonMark closes a fence only on a run at least as
 * long as the opener — so the wrapper has to out-run whatever is inside it.
 */
function fenceFor(code) {
  let longest = 0;
  for (const run of String(code).match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * Locate the diagram fence in a markdown body.
 *
 * @returns `{ dsl, start, end, fence }` where `start`/`end` bound the whole
 *   fenced block (opening through closing line), or `null` when there is none.
 */
export function extractDiagramFence(body) {
  const lines = String(body ?? "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,})\s*([^\s`]*)\s*$/.exec(lines[i]);
    if (!open || open[3] !== FENCE_LANG) continue;
    const fence = open[2];
    const closeRe = new RegExp(`^\\s*\`{${fence.length},}\\s*$`);
    for (let j = i + 1; j < lines.length; j++) {
      if (!closeRe.test(lines[j])) continue;
      return { dsl: lines.slice(i + 1, j).join("\n"), start: i, end: j, fence };
    }
    return null; // opened but never closed — not a diagram we can safely rewrite
  }
  return null;
}

/** Replace the diagram fence's contents, leaving every other line untouched. */
export function replaceDiagramFence(body, dsl) {
  const found = extractDiagramFence(body);
  const block = `${fenceFor(dsl)}${FENCE_LANG}\n${dsl}\n${fenceFor(dsl)}`;
  if (!found) return body;
  const lines = String(body).split("\n");
  return [...lines.slice(0, found.start), ...block.split("\n"), ...lines.slice(found.end + 1)].join(
    "\n",
  );
}

/** True when `md` carries a diagram fence (a `.md` without one is just prose). */
export function isMarkdownDiagram(md) {
  return extractDiagramFence(splitFrontmatter(md).body) !== null;
}

/* ───────────────────────── the DSL's /meta/ section ────────────────────── */

function markerAt(line) {
  const t = line.trim();
  return SECTION_MARKERS.includes(t) ? t : null;
}

/**
 * Pull the `/meta/` section out of a DSL document.
 *
 * @returns `{ meta, dsl }` — `dsl` is the document with the section (and the
 *   single blank line that followed it) removed.
 */
export function readMetaSection(dsl) {
  const lines = String(dsl ?? "").split("\n");
  const start = lines.findIndex((l) => markerAt(l) === "/meta/");
  if (start < 0) return { meta: {}, dsl: String(dsl ?? "") };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (markerAt(lines[i]) || lines[i].trim() === "@end") {
      end = i;
      break;
    }
  }

  const meta = {};
  for (const line of lines.slice(start + 1, end)) {
    const t = line.trim();
    if (!t) continue;
    const cut = t.indexOf(":");
    if (cut < 0) continue;
    const key = t.slice(0, cut).trim();
    const value = t
      .slice(cut + 1)
      .replace(/;\s*$/, "")
      .trim();
    if (key) meta[key] = value;
  }

  // Drop the section and the blank line separating it from what follows, so
  // re-inserting it reproduces the original byte for byte.
  let cutEnd = end;
  if (lines[end - 1]?.trim() === "" && end > start + 1) cutEnd = end;
  const rest = [...lines.slice(0, start), ...lines.slice(cutEnd)];
  return { meta, dsl: rest.join("\n") };
}

/**
 * Insert a `/meta/` section built from `meta`, ahead of the first other
 * section — `/meta/` sorts first in dsl-rule.md:324's order.
 *
 * `/meta/` is scalar-only, so `meta` must already be the projection
 * `projectMeta` produces.
 */
export function writeMetaSection(dsl, meta) {
  const keys = orderedMetaKeys(meta);
  const text = String(dsl ?? "");
  if (!keys.length) return text;

  const lines = text.split("\n");
  const block = ["/meta/", ...keys.map((k) => `${k}: ${meta[k]};`), ""];
  let at = lines.findIndex((l) => markerAt(l));
  if (at < 0) at = lines.findIndex((l) => l.trim() === "@end");
  if (at < 0) at = lines.length;
  return [...lines.slice(0, at), ...block, ...lines.slice(at)].join("\n");
}

/* ───────────────────────────── the projection ──────────────────────────── */

/** The `/meta/` text for one value, or null when the fence cannot hold it. */
function projectValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item));
    return flattenable(items) ? items.join(LIST_SEP) : null;
  }
  return null; // a nested map has no `key: value;` form
}

/**
 * The scalar subset of `meta` that the DSL's `/meta/` section can carry.
 *
 * Everything else — nested maps, empty lists, lists whose items contain the
 * separator — stays in the frontmatter only, which is why `mergeMetaProjection`
 * may never delete a key it does not find here.
 */
export function projectMeta(meta) {
  const out = {};
  for (const [key, value] of Object.entries(meta ?? {})) {
    const flat = projectValue(value);
    if (flat !== null) out[key] = flat;
  }
  return out;
}

/**
 * Fold an edited `/meta/` section back into the full frontmatter model.
 *
 * `before` is what the document held; `projected` is what came out of the
 * fence. A key in `projected` wins. A key only in `before` survives unless it
 * was projectable — see the deletion rule at the top of this file.
 */
export function mergeMetaProjection(before, projected) {
  const previous = before ?? {};
  const incoming = projected ?? {};
  const merged = {};

  for (const [key, value] of Object.entries(previous)) {
    if (key in incoming) continue;
    // Projectable and absent from the fence means the author removed it there.
    if (projectValue(value) !== null) continue;
    merged[key] = value;
  }
  for (const [key, flat] of Object.entries(incoming)) {
    // A key the document wrote as a list keeps being one, so an edit through
    // `/meta/`'s comma-joined form does not flatten it on the way back.
    const items = Array.isArray(previous[key]) ? listItems(flat) : null;
    merged[key] = items ?? flat;
  }
  return merged;
}

/* ─────────────────────────────── the pair ──────────────────────────────── */

/**
 * The DSL a `.md` document holds, with the projectable half of its frontmatter
 * injected as `/meta/`, or `null` when the file carries no diagram at all.
 */
export function dslFromMarkdown(md) {
  const { meta, body } = splitFrontmatter(md);
  const found = extractDiagramFence(body);
  if (!found) return null;
  return writeMetaSection(found.dsl, projectMeta(meta));
}

/**
 * The markdown to store for `dsl`, given what the file held before.
 *
 * When `previousMd` is markdown with no diagram in it, `dsl` is that prose
 * being edited directly and is stored as-is — wrapping a README in a fence
 * would turn it into a broken diagram. Every host that can both read and write
 * a `.md` needs this exact rule, so it lives here rather than in each of them.
 */
export function storedMarkdown(dsl, previousMd) {
  if (previousMd !== undefined && previousMd !== null && !isMarkdownDiagram(previousMd)) return dsl;
  return markdownFromDsl(dsl, previousMd ?? undefined);
}

/**
 * Write `dsl` back out as a markdown document: `/meta/` merged into
 * frontmatter, the DSL in its fence, and — when `previousMd` is given — every
 * other line of prose exactly as it was.
 */
export function markdownFromDsl(dsl, previousMd) {
  const { meta: projected, dsl: withoutMeta } = readMetaSection(dsl);
  // What the document being replaced held, and how it wrote each key. Without
  // the values, every rich key would be lost the first time the fence was
  // edited; without the shapes, a block sequence would come back flat.
  const previous = previousMd != null ? splitFrontmatter(previousMd) : null;
  const meta = mergeMetaProjection(previous?.meta, projected);
  const frontmatter = serializeFrontmatter(meta, previous?.shape);

  if (previous && extractDiagramFence(previous.body)) {
    return frontmatter + replaceDiagramFence(previous.body, withoutMeta);
  }

  const fence = fenceFor(withoutMeta);
  return `${frontmatter}\n${fence}${FENCE_LANG}\n${withoutMeta}\n${fence}\n`;
}
