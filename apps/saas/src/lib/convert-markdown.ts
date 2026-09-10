/**
 * Planning the one-commit conversion of a project's diagrams to Markdown.
 *
 * Kept pure and separate from the route so the part that is easy to get wrong
 * — rewriting `@use` targets — can be tested without a repository. A diagram
 * that imports `./shared.txt` must come out importing `./shared.md`, or the
 * conversion quietly breaks every document that depended on it.
 */

import { storedFrom } from "./diagram-file";
import { resolveImportPath } from "./import-path";

export interface ConversionPlan {
  /** New `.md` documents, ready to commit. */
  writes: { path: string; text: string }[];
  /** The `.txt` files they replace, removed in the same commit. */
  deletions: string[];
  /** Every path change, so file identities can follow their files. */
  renames: { from: string; to: string }[];
}

/** The `.md` path a `.txt` diagram becomes. */
export function markdownPathFor(path: string): string {
  return `${path.slice(0, -".txt".length)}.md`;
}

const USE_DIRECTIVE = /@use([ \t]+)([^;\n]+);/gu;

/** Strip one layer of matching quotes, reporting whether there was one. */
function unquote(value: string): { path: string; quote: string } {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)) {
    return { path: value.slice(1, -1), quote };
  }
  return { path: value, quote: "" };
}

/**
 * Repoint every `@use` in `dsl` that names a file this conversion is renaming.
 *
 * Anything else is left exactly as written — a template fragment under
 * `templates/`, an image, or a path that resolves outside the set being
 * converted all keep pointing where they already point.
 */
export function rewriteImports(dsl: string, from: string, renamed: Set<string>): string {
  return dsl.replace(USE_DIRECTIVE, (whole, gap: string, operand: string) => {
    const trimmed = operand.trim();
    const as = /^(.*\S)\s+as\s+(\S+)$/u.exec(trimmed);
    const raw = as ? (as[1] as string) : trimmed;
    const { path, quote } = unquote(raw);
    if (!path.toLowerCase().endsWith(".txt")) return whole;
    if (!renamed.has(resolveImportPath(from, path))) return whole;
    const next = `${quote}${markdownPathFor(path)}${quote}`;
    return `@use${gap}${as ? `${next} as ${as[2]}` : next};`;
  });
}

/**
 * Plan the conversion of every `.txt` in `files` (path → text).
 *
 * `existing` is every path already in the repository, used to refuse rather
 * than overwrite when a `.md` is already sitting where a `.txt` would land.
 */
export function planMarkdownConversion(
  files: Record<string, string>,
  existing: Iterable<string> = [],
): ConversionPlan & { conflicts: string[] } {
  const sources = Object.keys(files)
    .filter((p) => p.toLowerCase().endsWith(".txt"))
    .sort();
  const taken = new Set(existing);
  const conflicts = sources.map(markdownPathFor).filter((p) => taken.has(p));
  if (conflicts.length) return { writes: [], deletions: [], renames: [], conflicts };

  // Every path being renamed, so an import can tell whether its target moved.
  const renamed = new Set(sources);
  const writes = sources.map((from) => {
    const to = markdownPathFor(from);
    return { path: to, text: storedFrom(to, rewriteImports(files[from] ?? "", from, renamed)) };
  });

  return {
    writes,
    deletions: sources,
    renames: sources.map((from) => ({ from, to: markdownPathFor(from) })),
    conflicts,
  };
}
