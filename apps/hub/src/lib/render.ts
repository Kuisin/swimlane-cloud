/**
 * DSL -> SVG, with the caching the renderer itself does not need.
 *
 * `textToSvg` is pure and dependency-free, and measured at 8-11 ms even for a
 * 67 KB output, so rendering per request is cheap. What is worth caching is the
 * *fetch*, not the render — and specifically the DSL text rather than the SVG,
 * because a large diagram's SVG approaches Next's data-cache entry ceiling.
 */

import { cache } from "react";
import { textToSvg } from "@swimlane-cloud/diagram-converter";

export interface RenderResult {
  svg: string | null;
  errors: Array<{ line?: number; text?: string; msg?: string }>;
}

/**
 * Never throws. A DSL error must degrade to "we could not draw this" with the
 * mobile view still available, not to a 500 — the source may well be a
 * half-finished diagram on a branch someone is actively editing.
 */
function renderUncached(dsl: string, themeKey: string): RenderResult {
  try {
    const { svg, errors } = textToSvg(dsl, { themeKey });
    return { svg, errors: errors ?? [] };
  } catch (err) {
    return { svg: null, errors: [{ msg: err instanceof Error ? err.message : String(err) }] };
  }
}

/** Per-request dedup: the page and its metadata both render the same diagram. */
export const render = cache(renderUncached);

/** Extract `/title/ ...` for the page heading without a full parse. */
export function extractTitle(dsl: string): string | null {
  const m = /^\s*\/title\/\s*(.+)$/m.exec(dsl);
  return m?.[1]?.trim() || null;
}
