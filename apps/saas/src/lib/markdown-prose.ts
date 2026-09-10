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
 */
import {
  extractDiagramFence,
  splitFrontmatter,
  serializeFrontmatter,
} from "@swimlane-cloud/diagram-converter/markdown-doc";

/** Stands in for the diagram while the prose is being edited. */
export const DIAGRAM_PLACEHOLDER = "<!-- swimlane:diagram -->";

export interface MarkdownParts {
  meta: Record<string, string>;
  /** Prose with the diagram replaced by `DIAGRAM_PLACEHOLDER`, if it had one. */
  prose: string;
  /** The diagram's fenced block, exactly as stored, or null. */
  fence: string | null;
}

/** Split a stored document into metadata, prose, and the untouched fence. */
export function toProse(stored: string): MarkdownParts {
  const { meta, body } = splitFrontmatter(stored);
  const found = extractDiagramFence(body);
  if (!found) return { meta, prose: body, fence: null };

  const lines = body.split("\n");
  const fence = lines.slice(found.start, found.end + 1).join("\n");
  const prose = [
    ...lines.slice(0, found.start),
    DIAGRAM_PLACEHOLDER,
    ...lines.slice(found.end + 1),
  ].join("\n");
  return { meta, prose, fence };
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
  const frontmatter = serializeFrontmatter(parts.meta);
  if (!parts.fence) return frontmatter + prose;

  if (prose.includes(DIAGRAM_PLACEHOLDER)) {
    return frontmatter + prose.replace(DIAGRAM_PLACEHOLDER, parts.fence);
  }
  const separator = prose.endsWith("\n") ? "" : "\n";
  return `${frontmatter}${prose}${separator}\n${parts.fence}\n`;
}
