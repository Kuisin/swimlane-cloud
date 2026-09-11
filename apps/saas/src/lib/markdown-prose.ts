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
 * Whether this document's frontmatter may be rewritten at all.
 *
 * The test is the strongest one available: re-emit exactly what was parsed and
 * see whether the original block comes back byte for byte. If it does not, the
 * engine's model of this file is lossy somewhere, and writing it back would
 * edit lines nobody touched.
 *
 * The engine already verifies each key this way as it parses — it re-emits the
 * key and demotes it to `verbatim` unless the result matches the lines it came
 * from — so on a healthy document this can only agree with it. That makes the
 * question worth asking precisely: what does a whole-document check add over a
 * per-key one that is already byte-exact?
 *
 * It covers the lines that belong to no key. That gap was not hypothetical: a
 * standalone `# comment` and an author's blank line were silently deleted on
 * every save until the engine learned to carry them, because the per-key check
 * had nothing to attach them to and a green gate had nothing to notice. The
 * shape of that bug is the point — the per-key check is only as wide as the set
 * of things the model knows are there. This one compares the whole block and so
 * does not need to know what it is looking for, which is what makes it worth
 * keeping now that the known gaps are closed: it is the thing that sees the
 * next one.
 *
 * A document that fails this keeps its frontmatter exactly as it is, and the
 * form says so once rather than saving some keys over a structure it cannot
 * reproduce. Refusing an edit is recoverable; rewriting somebody's YAML
 * underneath them is not. The one shape known to fail today is a duplicate key,
 * which collapses to last-wins — YAML calls that document an error, so freezing
 * it rather than silently rewriting it is the right answer anyway.
 */
function rewritable(meta: MetaRecord, shape: FrontmatterShape, frontmatter: string): boolean {
  return serializeFrontmatter(meta, shape) === frontmatter;
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
    ? serializeFrontmatter(parts.meta, parts.shape)
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
