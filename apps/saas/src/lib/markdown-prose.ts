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

/** Split a stored document into metadata, prose, and the untouched fence. */
export function toProse(stored: string): MarkdownParts {
  const { meta, body, shape } = splitFrontmatter(stored);
  const found = extractDiagramFence(body);
  const parts = { meta, shape };
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
 */
export function fromProse(parts: MarkdownParts, prose: string): string {
  const frontmatter = serializeFrontmatter(parts.meta, parts.shape);
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
