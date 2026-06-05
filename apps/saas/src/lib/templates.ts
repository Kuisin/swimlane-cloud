/**
 * Section template helpers (plan §"Project section templates" / "Force templates").
 *
 * A DSL document is divided into seven sections delimited by markers like
 * `/page/`, `/option/`, `/role/`, `/block/`, `/prop/`, `/title/`, `/line/`
 * (see dsl-rule.md). Five of these are template-eligible.
 */
import { ApiError } from "./api";

export const TEMPLATE_SECTIONS = [
  "page",
  "option",
  "role",
  "block",
  "prop",
] as const;

export type TemplateSection = (typeof TEMPLATE_SECTIONS)[number];

const ALL_SECTION_MARKERS = [
  "/title/",
  "/page/",
  "/option/",
  "/role/",
  "/block/",
  "/prop/",
  "/line/",
];

export function isTemplateSection(value: string): value is TemplateSection {
  return (TEMPLATE_SECTIONS as readonly string[]).includes(value);
}

/**
 * Extract the raw text body of a section from a DSL document, between its
 * marker line (e.g. `/role/`) and the next section marker (or EOF). The marker
 * line itself is not included. Returns "" if the section is absent.
 */
export function extractSection(dsl: string, section: TemplateSection): string {
  const marker = `/${section}/`;
  const lines = dsl.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === marker) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return "";

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (ALL_SECTION_MARKERS.includes(lines[i].trim())) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

/**
 * Normalize a section body for forced-template comparison: trim each line,
 * drop blank lines, and collapse internal whitespace runs. This makes the
 * comparison resilient to indentation / trailing-space differences while still
 * catching real content divergence.
 */
export function normalizeSection(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line.length > 0)
    .join("\n");
}

export interface PolicyEntry {
  mode: "optional" | "default" | "forced";
  forcedTemplateId?: string | null;
}

export interface TemplateRow {
  id: string;
  section: TemplateSection;
  name: string;
  body: string;
}

/**
 * Throw a 422 ApiError if any forced section in `policies` does not match its
 * pinned template body (normalized compare). Called before any draft persist /
 * checkpoint / promote (plan Step 1.5 / 1.7).
 */
export function assertForcedSections(
  dslText: string,
  policies: Record<string, PolicyEntry>,
  templatesById: Record<string, TemplateRow>,
): void {
  for (const [section, policy] of Object.entries(policies)) {
    if (policy.mode !== "forced") continue;
    if (!isTemplateSection(section)) continue;
    const templateId = policy.forcedTemplateId;
    if (!templateId) {
      throw new ApiError(
        500,
        `Section /${section}/ is forced but no template is pinned.`,
      );
    }
    const template = templatesById[templateId];
    if (!template) {
      throw new ApiError(
        500,
        `Forced template ${templateId} for /${section}/ not found.`,
      );
    }
    const expected = normalizeSection(template.body);
    const actual = normalizeSection(extractSection(dslText, section));
    if (actual !== expected) {
      throw new ApiError(
        422,
        `/${section}/ must match project template "${template.name}".`,
      );
    }
  }
}

/** Repo mirror path for a template (plan: templates/{section}/{slug}.txt). */
export function templateRepoPath(
  section: TemplateSection,
  slug: string,
): string {
  return `templates/${section}/${slug}.txt`;
}
