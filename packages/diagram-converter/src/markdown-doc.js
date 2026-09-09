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
 * line, double-quoted when the value could not survive a round-trip bare. It is
 * not general YAML — this module both writes and reads it, and `/meta/` values
 * are themselves untyped strings at runtime (`parser-v2.js`), so nothing is
 * gained by parsing more than we emit.
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

/** Meta keys in canonical order: the five reserved ones, then the rest sorted. */
export function orderedMetaKeys(meta) {
  const keys = Object.keys(meta ?? {});
  const reserved = META_KEY_ORDER.filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !META_KEY_ORDER.includes(k)).sort();
  return [...reserved, ...rest];
}

/**
 * The `---` block for `meta`, including its trailing newline, or `""` when
 * there is no metadata to write.
 */
export function serializeFrontmatter(meta) {
  const keys = orderedMetaKeys(meta);
  if (!keys.length) return "";
  const lines = keys.map((k) => {
    const value = String(meta[k] ?? "");
    return `${k}: ${needsQuoting(value) ? quote(value) : value}`;
  });
  return `${FRONTMATTER_DELIM}\n${lines.join("\n")}\n${FRONTMATTER_DELIM}\n`;
}

/**
 * Split a leading `---` frontmatter block off `md`.
 *
 * Only a block at the very start counts; a `---` later in the document is an
 * ordinary thematic break and is left in `body`.
 */
export function splitFrontmatter(md) {
  const text = String(md ?? "");
  const lines = text.split("\n");
  if (lines[0]?.trim() !== FRONTMATTER_DELIM)
    return { meta: {}, body: text, hadFrontmatter: false };

  const end = lines.findIndex((l, i) => i > 0 && l.trim() === FRONTMATTER_DELIM);
  if (end < 0) return { meta: {}, body: text, hadFrontmatter: false };

  const meta = {};
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue;
    const cut = line.indexOf(":");
    if (cut < 0) continue;
    const key = line.slice(0, cut).trim();
    if (!key) continue;
    const raw = line.slice(cut + 1).trim();
    meta[key] = raw.length > 1 && raw.startsWith('"') && raw.endsWith('"') ? unquote(raw) : raw;
  }
  return { meta, body: lines.slice(end + 1).join("\n"), hadFrontmatter: true };
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
  return writeMetaSection(found.dsl, meta);
}

/**
 * Write `dsl` back out as a markdown document: `/meta/` lifted into
 * frontmatter, the DSL in its fence, and — when `previousMd` is given — every
 * other line of prose exactly as it was.
 */
export function markdownFromDsl(dsl, previousMd) {
  const { meta, dsl: withoutMeta } = readMetaSection(dsl);
  const frontmatter = serializeFrontmatter(meta);

  if (previousMd != null && extractDiagramFence(splitFrontmatter(previousMd).body)) {
    const { body } = splitFrontmatter(previousMd);
    return frontmatter + replaceDiagramFence(body, withoutMeta);
  }

  const fence = fenceFor(withoutMeta);
  return `${frontmatter}\n${fence}${FENCE_LANG}\n${withoutMeta}\n${fence}\n`;
}
