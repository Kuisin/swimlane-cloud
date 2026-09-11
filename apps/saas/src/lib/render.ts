/**
 * DSL -> SVG for versions and the public share page.
 *
 * `textToSvg` is pure and measured at ~10 ms even for a large diagram, so
 * nothing is stored: a version keeps its DSL snapshot in Postgres and every
 * SVG is rendered on request. Same shape as `apps/hub/src/lib/render.ts`.
 */
import { cache } from "react";
import { textToSvg } from "@swimlane-cloud/diagram-converter";

export interface RenderResult {
  svg: string | null;
  errors: Array<{ line?: number; text?: string; msg?: string }>;
}

/**
 * Never throws. A DSL error must degrade to "we could not draw this", not a
 * 500 — a flagged version may legitimately contain a half-finished file.
 */
function renderUncached(dsl: string, themeKey = "basic", layoutJson?: string): RenderResult {
  try {
    // Passed as JSON so `cache()` can dedup on it: React's cache keys on
    // argument identity, and a fresh object per call would defeat it.
    const layout = layoutJson ? (JSON.parse(layoutJson) as Record<string, number>) : undefined;
    const { svg, errors } = textToSvg(dsl, { themeKey, layout });
    return { svg, errors: errors ?? [] };
  } catch (err) {
    return { svg: null, errors: [{ msg: err instanceof Error ? err.message : String(err) }] };
  }
}

/** Per-request dedup: a page and its metadata may render the same diagram. */
const renderCached = cache(renderUncached);

/**
 * `layout` is the repository's `.swimlane.json` overrides; omit it and the
 * engine defaults apply, which is what every caller without a repo context
 * (the public share page today) gets.
 */
export function render(
  dsl: string,
  themeKey = "basic",
  layout?: Record<string, number> | null,
): RenderResult {
  const hasLayout = layout && Object.keys(layout).length > 0;
  return renderCached(dsl, themeKey, hasLayout ? JSON.stringify(layout) : undefined);
}

/** Extract `/title/ ...` for headings without a full parse. */
export function extractTitle(dsl: string): string | null {
  const m = /^\s*\/title\/\s*(.+)$/m.exec(dsl);
  return m?.[1]?.trim() || null;
}
