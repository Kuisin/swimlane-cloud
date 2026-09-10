/**
 * Server-only half of the manual: reads `content/manual/<lang>/<slug>.md`.
 * Split out of `manual.ts` so a `node:fs` import never reaches client code —
 * see the note there for why the page has to import that file directly.
 * Only the route handler imports this file; nothing client-side should.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ManualLang, ManualSlug } from "./manual";

const CONTENT_DIR = path.join(process.cwd(), "content", "manual");

/** The raw Markdown for one section, or null when it hasn't been written yet. */
export function readManualSection(lang: ManualLang, slug: ManualSlug): string | null {
  try {
    return readFileSync(path.join(CONTENT_DIR, lang, `${slug}.md`), "utf8");
  } catch {
    return null;
  }
}
