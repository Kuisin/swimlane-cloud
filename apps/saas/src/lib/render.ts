/**
 * DSL -> SVG for versions and the public share page.
 *
 * `textToSvg` is pure and measured at ~10 ms even for a large diagram, so
 * nothing is stored: a version keeps its DSL snapshot in Postgres and every
 * SVG is rendered on request. Same shape as `apps/hub/src/lib/render.ts`.
 */
import { cache } from "react";
import { textToSvg } from "@swimlane-cloud/diagram-converter";
import { parseDiagramSettings, type DiagramSettings } from "@swimlane-cloud/github-client";

export interface RenderResult {
  svg: string | null;
  errors: Array<{ line?: number; text?: string; msg?: string }>;
}

/**
 * Never throws. A DSL error must degrade to "we could not draw this", not a
 * 500 — a flagged version may legitimately contain a half-finished file.
 */
export interface RenderExtras {
  /** Drawn top-right for a printed image: the file's path and metadata. */
  documentInfo?: { path?: string; meta?: Record<string, string> };
  /** A linked step's ↗ becomes an <a href> when this names a URL for it. */
  linkHref?: (link: string) => string | null;
}

function renderUncached(
  dsl: string,
  themeKey = "basic",
  diagramDefaults?: DiagramSettings | null,
  extras?: RenderExtras,
): RenderResult {
  try {
    const { svg, errors } = textToSvg(dsl, {
      themeKey,
      diagramDefaults: diagramDefaults ?? {},
      ...(extras ?? {}),
    });
    return { svg, errors: errors ?? [] };
  } catch (err) {
    return { svg: null, errors: [{ msg: err instanceof Error ? err.message : String(err) }] };
  }
}

/** Per-request dedup: a page and its metadata may render the same diagram. */
export const render = cache(renderUncached);

/**
 * The diagram settings a version was flagged with, off a row that selected
 * `settings_json` — directly, or through a `versions!inner(...)` join, which
 * Supabase hands back as an object or a one-element array.
 */
export function versionDiagramSettings(row: unknown): DiagramSettings {
  const r = (row ?? {}) as { settings_json?: unknown; versions?: unknown };
  const joined = Array.isArray(r.versions) ? r.versions[0] : r.versions;
  const raw = r.settings_json ?? (joined as { settings_json?: unknown } | undefined)?.settings_json;
  return parseDiagramSettings(raw);
}

/** Extract `/title/ ...` for headings without a full parse. */
export function extractTitle(dsl: string): string | null {
  const m = /^\s*\/title\/\s*(.+)$/m.exec(dsl);
  return m?.[1]?.trim() || null;
}
