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
function renderUncached(dsl: string, themeKey = "basic"): RenderResult {
  try {
    const { svg, errors } = textToSvg(dsl, { themeKey });
    return { svg, errors: errors ?? [] };
  } catch (err) {
    return { svg: null, errors: [{ msg: err instanceof Error ? err.message : String(err) }] };
  }
}

/** Per-request dedup: a page and its metadata may render the same diagram. */
export const render = cache(renderUncached);

/** Extract `/title/ ...` for headings without a full parse. */
export function extractTitle(dsl: string): string | null {
  const m = /^\s*\/title\/\s*(.+)$/m.exec(dsl);
  return m?.[1]?.trim() || null;
}
