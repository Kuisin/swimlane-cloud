/**
 * Which files hold a diagram, and how to get the DSL out of one.
 *
 * A diagram is stored either as raw DSL in a `.txt` or inside a
 * ```` ```kai-swimlane ```` fence in a `.md`. The hub only ever renders
 * diagrams, so a `.md` that carries no fence is not servable at all — which is
 * what keeps `assertDiagramPath`'s promise that this app cannot be pointed at
 * arbitrary repository content.
 */

import { dslFromMarkdown } from "@swimlane-cloud/diagram-converter/markdown-doc";

const EXTENSIONS = [".txt", ".md"];

export function isDiagramPath(path: string): boolean {
  const lower = path.toLowerCase();
  return EXTENSIONS.some((e) => lower.endsWith(e));
}

export function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

/** The DSL `text` holds, or null when it holds no diagram. */
export function dslOf(path: string, text: string): string | null {
  if (!isDiagramPath(path)) return null;
  return isMarkdownPath(path) ? dslFromMarkdown(text) : text;
}
