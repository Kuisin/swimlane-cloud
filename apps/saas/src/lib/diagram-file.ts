/**
 * What a stored diagram file holds.
 *
 * A diagram lives in a `.txt` (raw DSL) or a `.md` (frontmatter + prose + the
 * DSL in a ```kai-swimlane fence). Everything that reads repository content —
 * rendering, version snapshots, forced-template checks — must go through
 * `dslOf` rather than assuming the bytes on disk are DSL, or a `.md` diagram
 * silently reads as gibberish.
 *
 * `.md` is deliberately *not* the same thing as "a diagram": a repository may
 * hold plain prose too (every project this app creates is seeded with a
 * `diagrams/README.md`). `dslOf` returns `null` for those, which is the signal
 * to skip a file rather than to fail on it.
 */
import {
  dslFromMarkdown,
  isMarkdownDiagram,
  markdownFromDsl,
} from "@swimlane-cloud/diagram-converter/markdown-doc";

/** Extensions a diagram may be stored in. */
export const DIAGRAM_EXTENSIONS = [".txt", ".md"] as const;

/** True for a path that may hold a diagram (by extension alone). */
export function isDiagramFile(path: string): boolean {
  const lower = path.toLowerCase();
  return DIAGRAM_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isMarkdownFile(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

/**
 * The DSL `text` holds, or `null` when it holds none.
 *
 * `.txt` is DSL as-is. `.md` has its frontmatter injected back as `/meta/` and
 * its fence unwrapped; a `.md` with no fence is prose, not a diagram. Anything
 * else — a `.gitkeep` folder marker, say — holds no DSL either, which is why
 * this returns `null` rather than the raw bytes.
 */
export function dslOf(path: string, text: string): string | null {
  if (!isDiagramFile(path)) return null;
  if (!isMarkdownFile(path)) return text;
  return dslFromMarkdown(text);
}

/**
 * The inverse of `dslOf`: the bytes to store for `path` after editing.
 *
 * `previous` is what the file held before, so a `.md`'s frontmatter and prose
 * survive an edit to the diagram inside it. When `previous` is markdown with
 * no diagram in it, `text` is that prose being edited directly and is stored
 * as-is — wrapping it in a fence would turn a README into a broken diagram.
 */
export function storedFrom(path: string, text: string, previous?: string): string {
  if (!isMarkdownFile(path)) return text;
  if (previous !== undefined && !isMarkdownDiagram(previous)) return text;
  return markdownFromDsl(text, previous);
}
