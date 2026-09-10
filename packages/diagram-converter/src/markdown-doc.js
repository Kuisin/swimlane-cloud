/**
 * Markdown as a storage format for a diagram.
 *
 * A diagram may live in a `.md` file rather than a `.txt` one: frontmatter
 * carrying its metadata, ordinary prose, and the DSL inside a fenced
 * ```` ```kai-swimlane ```` block. dsl-rule.md:311-314 already specifies that a
 * header-less region inside a Markdown fence reads as version 2, and
 * `utils.js`'s `TEMPLATE_FENCE_RE` already recognises the same fence for
 * templates — this module is the read/write half of that idea.
 *
 * **Frontmatter is exactly the `/meta/` section.** Reading injects it into the
 * DSL as `/meta/`; writing lifts `/meta/` back out. Nothing else crosses the
 * boundary — in particular `/title/` stays inside the fence, so there is never
 * a second, drifting copy of it. That one-to-one mapping is what makes
 * `markdownFromDsl(dslFromMarkdown(md)) === md` hold.
 *
 * The frontmatter dialect is a deliberate subset: one `key: value` scalar per
 * line, double-quoted when the value could not survive a round-trip bare, plus
 * `- ` block sequences, which real documents use heavily and which flatten to
 * the same comma-joined string `/meta/` already gives `tags`. It is not general
 * YAML — but it must never *mangle* general YAML either, so a value written in
 * any shape this module cannot rebuild (a nested map, a `|`/`>` block scalar) is
 * carried through verbatim instead of being flattened into a lossy scalar.
 */

import { dslVersion } from "./parser-v2.js";

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

/** Meta keys in canonical order: the five reserved ones, then the rest sorted. */
export function orderedMetaKeys(meta) {
  const keys = Object.keys(meta ?? {});
  const reserved = META_KEY_ORDER.filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !META_KEY_ORDER.includes(k)).sort();
  return [...reserved, ...rest];
}

/**
 * The separator a block sequence flattens to. It matches what `/meta/` already
 * does with `tags`, so a list reads the same way everywhere downstream.
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
  const values = meta ?? {};
  const kept = shape instanceof Map ? shape : new Map();
  const verbatim = [...kept].filter(([, v]) => v.kind === "verbatim").map(([k]) => k);
  const all = { ...values };
  for (const k of verbatim) if (!(k in all)) all[k] = "";
  const known = [...kept.keys()].filter((k) => k in all);
  const added = Object.keys(all).filter((k) => !kept.has(k));
  const keys = [...known, ...orderedMetaKeys(Object.fromEntries(added.map((k) => [k, all[k]])))];
  if (!keys.length) return "";

  const lines = [];
  for (const key of keys) {
    const how = kept.get(key);
    if (how?.kind === "verbatim") {
      lines.push(...how.lines);
      continue;
    }
    const value = String(values[key] ?? "");
    const items = how?.kind === "list" || how?.kind === "flowList" ? listItems(value) : null;
    if (items && how.kind === "flowList") {
      lines.push(`${key}: [${items.map((v) => (needsQuoting(v) ? quote(v) : v)).join(LIST_SEP)}]`);
      continue;
    }
    if (items) {
      lines.push(`${key}:`);
      for (const item of items) lines.push(`  - ${needsQuoting(item) ? quote(item) : item}`);
      continue;
    }
    lines.push(`${key}: ${needsQuoting(value) ? quote(value) : value}`);
  }
  return `${FRONTMATTER_DELIM}\n${lines.join("\n")}\n${FRONTMATTER_DELIM}\n`;
}

function scalar(raw) {
  return raw.length > 1 && raw.startsWith('"') && raw.endsWith('"') ? unquote(raw) : raw;
}

/** A `key:` whose value is written on the lines below it, as `- item` entries. */
const SEQUENCE_ITEM = /^\s+-\s*(.*)$/;

/** `|`, `>` and their chomping/indentation variants: the value is the block below. */
const BLOCK_SCALAR = /^[|>][-+]?\d*$/;

/** `[a, b]` written inline — the same list, in YAML's flow style. */
const FLOW_SEQUENCE = /^\[(.*)\]$/;

/**
 * Inline forms YAML reads as something other than a plain string. Quoting one
 * of these would change what it means, so its key is kept verbatim instead.
 */
function isOpaqueInline(raw) {
  return BLOCK_SCALAR.test(raw) || raw.startsWith("{") || "&*!".includes(raw[0]);
}

/**
 * Split a leading `---` frontmatter block off `md`.
 *
 * Only a block at the very start counts; a `---` later in the document is an
 * ordinary thematic break and is left in `body`.
 *
 * `shape` records how each key was written so `serializeFrontmatter` can write
 * it back the same way — see the note at the top of this file about why an
 * unmodellable value is kept verbatim rather than flattened.
 */
export function splitFrontmatter(md) {
  const text = String(md ?? "");
  const lines = text.split("\n");
  const none = { meta: {}, body: text, hadFrontmatter: false, shape: new Map() };
  if (lines[0]?.trim() !== FRONTMATTER_DELIM) return none;

  const end = lines.findIndex((l, i) => i > 0 && l.trim() === FRONTMATTER_DELIM);
  if (end < 0) return none;

  const meta = {};
  const shape = new Map();
  const block = lines.slice(1, end);

  for (let i = 0; i < block.length; i++) {
    const line = block[i];
    if (!line.trim()) continue;
    const cut = line.indexOf(":");
    // A continuation line we did not consume below belongs to the key above it,
    // whose shape is already `verbatim` — nothing to do.
    if (cut < 0 || /^\s/.test(line)) continue;
    const key = line.slice(0, cut).trim();
    if (!key) continue;

    // Every line indented under this key, which a block form's value lives on.
    const owned = [];
    let j = i + 1;
    for (; j < block.length; j++) {
      if (!block[j].trim() || !/^\s/.test(block[j])) break;
      owned.push(block[j]);
    }

    const inline = line.slice(cut + 1).trim();
    if (inline) {
      const flow = FLOW_SEQUENCE.exec(inline);
      const items = flow ? flow[1].split(",").map((s) => scalar(s.trim())) : null;
      if (items && flattenable(items)) {
        meta[key] = items.join(LIST_SEP);
        shape.set(key, { kind: "flowList" });
      } else if (flow || isOpaqueInline(inline)) {
        shape.set(key, { kind: "verbatim", lines: [line, ...owned] });
        i = j - 1;
      } else {
        meta[key] = scalar(inline);
        shape.set(key, { kind: "scalar" });
      }
      continue;
    }

    // `key:` with nothing after it: a block sequence, a nested map, or empty.
    if (!owned.length) {
      meta[key] = "";
      shape.set(key, { kind: "scalar" });
      continue;
    }
    const items = owned.map((l) => SEQUENCE_ITEM.exec(l)).map((m) => m && scalar(m[1].trim()));
    if (flattenable(items)) {
      meta[key] = items.join(LIST_SEP);
      shape.set(key, { kind: "list" });
    } else {
      shape.set(key, { kind: "verbatim", lines: [line, ...owned] });
    }
    i = j - 1;
  }
  return { meta, body: lines.slice(end + 1).join("\n"), hadFrontmatter: true, shape };
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

/**
 * Whether a diagram can carry its own metadata.
 *
 * `/meta/` is a version 2 section — version 1's entry in dsl-rule.md:142 is
 * "—". A version 1 diagram has nowhere to put metadata, so injecting a
 * `/meta/` block into one writes a section its reader silently ignores; the
 * next save regenerates the diagram from that model, finds no `/meta/` to lift
 * back out, and the frontmatter is gone.
 *
 * So version 1 keeps its frontmatter *beside* the diagram rather than through
 * it. `dslVersion` returns null for a header-less region, which dsl-rule.md
 * :311-314 reads as version 2 — so only an explicit version 1 is excluded.
 */
function carriesMetaSection(dsl) {
  return dslVersion(dsl) !== 1;
}

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

/* ─────────────────────────────── the pair ──────────────────────────────── */

/**
 * The DSL a `.md` document holds, with its frontmatter injected as `/meta/`,
 * or `null` when the file carries no diagram at all (plain prose).
 */
export function dslFromMarkdown(md) {
  const { meta, body } = splitFrontmatter(md);
  const found = extractDiagramFence(body);
  if (!found) return null;
  if (!carriesMetaSection(found.dsl)) return found.dsl;
  return writeMetaSection(found.dsl, meta);
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
 * Write `dsl` back out as a markdown document: `/meta/` lifted into
 * frontmatter, the DSL in its fence, and — when `previousMd` is given — every
 * other line of prose exactly as it was.
 */
export function markdownFromDsl(dsl, previousMd) {
  const carries = carriesMetaSection(dsl);
  const { meta, dsl: withoutMeta } = carries ? readMetaSection(dsl) : { meta: {}, dsl };
  // How the document being replaced wrote each key. Without this a block
  // sequence would come back as a flat scalar and its items would be lost.
  const previous = previousMd != null ? splitFrontmatter(previousMd) : null;
  // A version 1 diagram cannot hold metadata, so the document's own
  // frontmatter is authoritative and passes straight through untouched.
  const frontmatter = serializeFrontmatter(
    carries ? meta : (previous?.meta ?? {}),
    previous?.shape,
  );

  if (previous && extractDiagramFence(previous.body)) {
    return frontmatter + replaceDiagramFence(previous.body, withoutMeta);
  }

  const fence = fenceFor(withoutMeta);
  return `${frontmatter}\n${fence}${FENCE_LANG}\n${withoutMeta}\n${fence}\n`;
}
