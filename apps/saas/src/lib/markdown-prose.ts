/**
 * Splitting a stored `.md` into the parts the Document view edits.
 *
 * The WYSIWYG edits prose and metadata only. The diagram fence is lifted out
 * first and put back verbatim on save, standing in the document as an HTML
 * comment while it is away.
 *
 * That indirection is the point: a markdown serializer is free to re-flow what
 * it round-trips — re-indent a block, change a fence's backtick count — and the
 * DSL inside our fence cannot survive that (it may contain its own ``` fenced
 * `desc:` value, so fence length is load-bearing). Never handing the fence to
 * the editor is what makes corrupting it impossible rather than unlikely.
 *
 * The frontmatter goes the same way. `shape` — how the engine found each key
 * written — is carried through the edit and handed back on save, so a block
 * sequence comes back a block sequence and a value the engine can only carry
 * verbatim (a nested map, a `|` block scalar) is written back byte for byte
 * instead of being flattened into a lossy scalar.
 */
import {
  extractDiagramFence,
  splitFrontmatter,
  serializeFrontmatter,
  type FrontmatterShape,
} from "@swimlane-cloud/diagram-converter/markdown-doc";
import { metaText, type MetaRecord, type MetaValue } from "./metadata-schema";

/** Stands in for the diagram while the prose is being edited. */
export const DIAGRAM_PLACEHOLDER = "<!-- swimlane:diagram -->";

export interface MarkdownParts {
  meta: MetaRecord;
  /** Prose with the diagram replaced by `DIAGRAM_PLACEHOLDER`, if it had one. */
  prose: string;
  /** The diagram's fenced block, exactly as stored, or null. */
  fence: string | null;
  /** How the stored document wrote each key — see the note above. */
  shape: FrontmatterShape;
  /** The `---` block exactly as the file holds it, `""` when there is none. */
  frontmatter: string;
  /**
   * Whether re-emitting this document's frontmatter reproduces it byte for
   * byte — see `rewritable` for why anything else must not be rewritten.
   */
  rewritable: boolean;
}

/**
 * Values the engine kept verbatim, key → the lines it holds them on.
 *
 * These are not in `meta` at all: the engine models them as "written in a shape
 * I cannot rebuild", which is exactly the set the Document form must show
 * read-only rather than offer to edit.
 */
export function carriedValues(shape: FrontmatterShape): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [key, how] of shape) {
    if (how.kind === "verbatim") out.set(key, how.lines);
  }
  return out;
}

/**
 * The engine's frontmatter API still types a value as a plain string, because
 * the ambient declaration in `apps/saas/types/diagram-converter.d.ts` has not
 * been widened to the `string | string[] | nested map` model the package now
 * has. This cast is the only place that gap lives.
 */
function asEngineMeta(meta: MetaRecord): Record<string, string> {
  return meta as unknown as Record<string, string>;
}

/** Keys whose value comes back different after one serialize/parse trip. */
function roundTripFailures(meta: MetaRecord, shape?: FrontmatterShape): string[] {
  const back = splitFrontmatter(serializeFrontmatter(asEngineMeta(meta), shape)).meta as MetaRecord;
  return Object.keys(meta).filter((key) => metaText(meta[key]) !== metaText(back[key]));
}

/**
 * The metadata to hand the engine, and the keys it could not take at all.
 *
 * Asked of the engine rather than assumed: serialize, parse it back, and see
 * what changed. A sequence that does not survive as a sequence is retried as
 * the comma-joined scalar the engine flattens one to, which is how a list still
 * round-trips through a build of the engine that cannot yet write an array.
 * Whatever still fails is left out entirely, so `serializeFrontmatter` re-emits
 * it from `shape` exactly as the document already had it.
 *
 * DELETE THIS WHOLE FUNCTION when `feat/md-metadata-engine` merges, and call
 * `serializeFrontmatter(meta, shape)` directly with the structured values.
 * `splitFrontmatter` round-trip-verifies every key on that branch and keeps any
 * key it cannot re-emit byte-identically as `verbatim` — so this outer check
 * becomes strictly redundant with the engine's inner one and can never fire.
 * Left standing it would read like a guard while guarding nothing; the engine
 * author confirmed the direct call is supported and covered by tests.
 * `unwritableKeys` goes with it (it only ever answers `[]` from then on), along
 * with the `md.notWritable` string the form shows for it.
 *
 * Before deleting it, know what it did once, and why that is not a reason to
 * keep it. `MapControl` used to write a nested value back as the *text* of
 * itself, and this rejected the write — which is the only reason that bug never
 * reached a file. It would not catch it after the merge either: post-merge the
 * engine can write `{ repo: "name: docs" }` and read back that exact string, so
 * the trip is clean and the structure is gone. What makes the deletion safe is
 * that the bug is fixed at its source — `mapEntriesOf` now marks an entry the
 * editor cannot take back, and the control keeps the original value. Delete
 * this; do not delete that.
 */
function forEngine(
  meta: MetaRecord,
  shape?: FrontmatterShape,
): { engine: MetaRecord; rejected: string[] } {
  let engine = meta;
  let failing = roundTripFailures(engine, shape);
  const flattenable = failing.filter((key) => Array.isArray(engine[key]));
  if (flattenable.length) {
    engine = { ...engine };
    for (const key of flattenable) engine[key] = metaText(meta[key]);
    failing = roundTripFailures(engine, shape);
  }
  if (!failing.length) return { engine, rejected: [] };
  const kept: MetaRecord = {};
  for (const [key, value] of Object.entries(engine)) {
    if (!failing.includes(key)) kept[key] = value;
  }
  return { engine: kept, rejected: failing };
}

/**
 * Whether this document's frontmatter may be rewritten at all.
 *
 * The test is the strongest one available: re-emit exactly what was parsed and
 * see whether the original block comes back byte for byte. If it does not, the
 * engine's model of this file is lossy somewhere, and writing it back would
 * edit lines nobody touched.
 *
 * This is not hypothetical. Today's engine reads a sequence of mappings —
 *
 *     reviewers:
 *       - name: Jane
 *
 * — as an ordinary flattenable list whose one item is the string `name: Jane`,
 * and re-emits it quoted, as `- "name: Jane"`. A sequence of mappings has
 * silently become a sequence of strings, in a file the author only opened to
 * change some other key. The per-key round-trip check in `forEngine` does not
 * catch it, because that compares the flattened projection and the projection
 * is identical on both sides: it verifies serialization fidelity against a
 * value that was already wrong. Only comparing against the original bytes sees
 * it.
 *
 * So a document that fails this keeps its frontmatter exactly as it is, and the
 * form reports every key as unwritable rather than saving some of them over a
 * structure it cannot reproduce. Refusing an edit is recoverable; rewriting
 * somebody's YAML underneath them is not.
 */
function rewritable(meta: MetaRecord, shape: FrontmatterShape, frontmatter: string): boolean {
  return serializeFrontmatter(asEngineMeta(meta), shape) === frontmatter;
}

/** Split a stored document into metadata, prose, and the untouched fence. */
export function toProse(stored: string): MarkdownParts {
  const { meta, body, shape } = splitFrontmatter(stored);
  const found = extractDiagramFence(body);
  // `body` is always a suffix of `stored`, so what precedes it is the `---`
  // block exactly as the file holds it, whitespace and all.
  const frontmatter = stored.slice(0, stored.length - body.length);
  const parts = {
    meta: meta as MetaRecord,
    shape,
    frontmatter,
    rewritable: rewritable(meta as MetaRecord, shape, frontmatter),
  };
  if (!found) return { ...parts, prose: body, fence: null };

  const lines = body.split("\n");
  const fence = lines.slice(found.start, found.end + 1).join("\n");
  const prose = [
    ...lines.slice(0, found.start),
    DIAGRAM_PLACEHOLDER,
    ...lines.slice(found.end + 1),
  ].join("\n");
  return { ...parts, prose, fence };
}

/**
 * Keys whose value would not survive being written and read back — the ones
 * the form must show as "left unchanged" rather than pretend it saved.
 *
 * Every key when the document's frontmatter cannot be reproduced at all: none
 * of it is being rewritten, so none of it can be edited. Pass `parts` to get
 * that answer; the bare `(meta, shape)` form only knows about single values.
 */
export function unwritableKeys(
  meta: MetaRecord,
  shape?: FrontmatterShape,
  parts?: Pick<MarkdownParts, "rewritable">,
): string[] {
  if (parts && !parts.rewritable) return Object.keys(meta);
  return forEngine(meta, shape).rejected;
}

/**
 * Reassemble a stored document.
 *
 * If the placeholder is gone — the editor dropped the HTML comment, or the
 * author deleted it — the diagram is appended rather than lost. Losing a
 * diagram because a comment went missing would be the worst possible outcome
 * here, so this fails towards keeping it.
 *
 * Frontmatter the engine cannot reproduce is kept exactly as the file had it,
 * whatever the form did to it — see `rewritable`. The prose still saves; only
 * the metadata edit is refused, which the form has already warned about.
 */
export function fromProse(parts: MarkdownParts, prose: string): string {
  const frontmatter = parts.rewritable
    ? serializeFrontmatter(asEngineMeta(forEngine(parts.meta, parts.shape).engine), parts.shape)
    : parts.frontmatter;
  if (!parts.fence) return frontmatter + prose;

  if (prose.includes(DIAGRAM_PLACEHOLDER)) {
    return frontmatter + prose.replace(DIAGRAM_PLACEHOLDER, parts.fence);
  }
  const separator = prose.endsWith("\n") ? "" : "\n";
  return `${frontmatter}${prose}${separator}\n${parts.fence}\n`;
}

/** The metadata a stored `.md` holds, without splitting out its prose. */
export function metaOf(stored: string): {
  meta: MetaRecord;
  carried: string[];
  hadFrontmatter: boolean;
} {
  const { meta, shape, hadFrontmatter } = splitFrontmatter(stored);
  return { meta: meta as MetaRecord, carried: [...carriedValues(shape).keys()], hadFrontmatter };
}

export type { MetaValue, MetaRecord };
