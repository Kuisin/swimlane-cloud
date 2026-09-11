/**
 * `swimlane-settings.json` — one place to manage how the app treats a
 * repository.
 *
 * Distinct from `.swimlane.json`, which answers "where are the diagrams and
 * what do they look like" and is read on every page load. This file answers
 * "what is allowed to happen here, and how is every diagram drawn": the
 * branch model, which sources may reach the published branch, the render
 * settings a diagram inherits unless its own `/option/` says otherwise, and
 * which DSL sections must come from a template.
 *
 * It is deliberately data rather than code, because the guard workflow reads
 * it too (`main-guard.ts`). Editing the allowed sources here changes what
 * GitHub enforces on the next pull request — without regenerating the
 * workflow, and without going through this app at all.
 */

import { INTEGRATION_BRANCH, PROD_BRANCH } from "./branch-model.ts";
import { DEFAULT_METADATA_SCHEMA, parseMetadataSchema } from "./metadata-schema.ts";
import type { MetadataSchema } from "./metadata-schema.ts";

export { REPO_SETTINGS_PATH } from "./repo-paths.ts";

// The metadata schema is one more section of this file, so it is reachable from
// here as well as from its own module — callers should not have to know which
// of the two it lives in.
export {
  DEFAULT_METADATA_SCHEMA,
  METADATA_FIELD_TYPES,
  METADATA_PROBLEM_CODES,
  metadataDefaults,
  parseMetadataSchema,
  validateMetadata,
} from "./metadata-schema.ts";
export type {
  MetadataField,
  MetadataFieldType,
  MetadataProblem,
  MetadataProblemCode,
  MetadataSchema,
  MetadataValue,
} from "./metadata-schema.ts";

export const TEMPLATE_SECTIONS = ["page", "option", "role", "block", "prop"] as const;
export type TemplateSection = (typeof TEMPLATE_SECTIONS)[number];

/**
 * How strictly a section must follow the project's template:
 * `none` — free; `base` — new files start from the template, authors may
 * change it; `template-only` — every file must match the template exactly.
 */
export const TEMPLATE_MODES = ["none", "base", "template-only"] as const;
export type TemplateMode = (typeof TEMPLATE_MODES)[number];

export const BLOCK_TEXT_MODES = ["truncate", "wrap"] as const;
export type BlockTextMode = (typeof BLOCK_TEXT_MODES)[number];
/** Mirrors `BLOCK_MARGIN_MAX` in the diagram engine's `diagram-options.js`. */
export const BLOCK_MARGIN_MAX = 80;

/** Ceiling for a layout override. Generous; it only has to stop a typo. */
export const LAYOUT_VALUE_MAX = 10000;

/** Render settings every diagram inherits; a file's own `/option/` wins. */
export interface DiagramSettings {
  /** The fork circles and join diamonds. Off, the rails simply meet. */
  showGatewayIcons: boolean;
  /** Extra pixels of height on every step row. */
  blockMargin: number;
  /** A step's box text: cut to one line with an ellipsis, or wrapped. */
  blockText: BlockTextMode;
  /**
   * Page geometry — margins, gutter widths, the lane grid. Overrides for the
   * engine's `DIAGRAM_LAYOUT`, and unlike the settings above these are *not*
   * `/option/` keys: the page layout is repository-wide only.
   *
   * Only keys that differ from the engine default are stored, never the whole
   * table. That is what lets the editor revert a field by deleting its key, and
   * it keeps an improved engine default reaching repositories that never
   * pinned a value.
   *
   * Which keys mean anything, and their individual bounds, belong to the
   * engine (`LAYOUT_SETTINGS` in `diagram-layout.js`) — this package stays free
   * of that dependency so it remains light enough for the extension host, and
   * the renderer ignores anything it does not recognise anyway. Parsing here
   * only checks the shape.
   */
  layout: Record<string, number>;
}

export interface SwimlaneSettings {
  /** Bumped when a later version of the app must migrate this file. */
  version: number;
  branches: {
    published: string;
    approved: string;
    /** Prefix of the short-lived branch a published version is cut onto. */
    releasePrefix: string;
  };
  rules: {
    /** `published` may only change through a pull request. */
    publishedRequiresPullRequest: boolean;
    /**
     * Branch patterns a pull request into `published` may come from. `*` is a
     * trailing wildcard, matching the shell `case` the guard workflow uses.
     */
    allowedPublishedSources: string[];
    /** A commit pushed straight onto `published` is a failure. */
    forbidDirectPush: boolean;
    forbidForcePush: boolean;
  };
  diagram: DiagramSettings;
  /**
   * Per section. A section that is absent here leaves the project's own
   * policy alone, so an older file changes nothing.
   */
  templates: Partial<Record<TemplateSection, TemplateMode>>;
  /**
   * The metadata fields a diagram in this repository should carry. Declaration
   * only: a document with extra keys is fine, and an empty schema — the
   * default — leaves every `.md`'s frontmatter exactly as free-form as it was.
   */
  metadata: MetadataSchema;
}

export const DEFAULT_DIAGRAM_SETTINGS: DiagramSettings = {
  showGatewayIcons: true,
  blockMargin: 0,
  blockText: "truncate",
  layout: {},
};

export const DEFAULT_SETTINGS: SwimlaneSettings = {
  version: 1,
  branches: {
    published: PROD_BRANCH,
    approved: INTEGRATION_BRANCH,
    releasePrefix: "release-",
  },
  rules: {
    publishedRequiresPullRequest: true,
    // `release-*` is not a convenience: publishing pins one approved commit by
    // cutting a branch at it, so removing this stops every release.
    allowedPublishedSources: [INTEGRATION_BRANCH, "release-*"],
    forbidDirectPush: true,
    forbidForcePush: true,
  },
  diagram: DEFAULT_DIAGRAM_SETTINGS,
  templates: {},
  metadata: DEFAULT_METADATA_SCHEMA,
};

/**
 * A private copy of the defaults.
 *
 * `DEFAULT_SETTINGS` is a module-level object holding mutable maps
 * (`diagram.layout`, `templates`). Handing it straight back to a caller who
 * has no reason to suspect it is shared — the settings editor merges into
 * `layout` — would let one request corrupt the defaults for the whole process.
 */
function freshDefaults(): SwimlaneSettings {
  return structuredClone(DEFAULT_SETTINGS);
}

export function repoSettingsJson(settings: SwimlaneSettings = DEFAULT_SETTINGS): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/**
 * Read the file, falling back to the defaults for anything absent or
 * malformed. A broken settings file must not be able to *weaken* the rules, so
 * every missing field takes the default rather than being treated as "off".
 */
export function parseRepoSettings(text: string | null): SwimlaneSettings {
  if (!text) return freshDefaults();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return freshDefaults();
  }
  if (!raw || typeof raw !== "object") return freshDefaults();
  const obj = raw as Record<string, unknown>;
  const branches = (obj.branches ?? {}) as Record<string, unknown>;
  const rules = (obj.rules ?? {}) as Record<string, unknown>;
  const sources = rules.allowedPublishedSources;

  const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

  return {
    version: typeof obj.version === "number" ? obj.version : DEFAULT_SETTINGS.version,
    branches: {
      published: str(branches.published, DEFAULT_SETTINGS.branches.published),
      approved: str(branches.approved, DEFAULT_SETTINGS.branches.approved),
      releasePrefix: str(branches.releasePrefix, DEFAULT_SETTINGS.branches.releasePrefix),
    },
    rules: {
      publishedRequiresPullRequest: bool(
        rules.publishedRequiresPullRequest,
        DEFAULT_SETTINGS.rules.publishedRequiresPullRequest,
      ),
      allowedPublishedSources:
        Array.isArray(sources) && sources.every((s) => typeof s === "string" && s)
          ? (sources as string[])
          : DEFAULT_SETTINGS.rules.allowedPublishedSources,
      forbidDirectPush: bool(rules.forbidDirectPush, DEFAULT_SETTINGS.rules.forbidDirectPush),
      forbidForcePush: bool(rules.forbidForcePush, DEFAULT_SETTINGS.rules.forbidForcePush),
    },
    diagram: parseDiagramSettings(obj.diagram),
    templates: parseTemplateModes(obj.templates),
    metadata: parseMetadataSchema(obj.metadata),
  };
}

/** Finite, non-negative, not absurd. Range per key is the engine's business. */
function parseLayout(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= LAYOUT_VALUE_MAX
    ) {
      out[key] = value;
    }
  }
  return out;
}

export function parseDiagramSettings(raw: unknown): DiagramSettings {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const margin = d.blockMargin;
  return {
    showGatewayIcons:
      typeof d.showGatewayIcons === "boolean"
        ? d.showGatewayIcons
        : DEFAULT_DIAGRAM_SETTINGS.showGatewayIcons,
    blockMargin:
      typeof margin === "number" &&
      Number.isInteger(margin) &&
      margin >= 0 &&
      margin <= BLOCK_MARGIN_MAX
        ? margin
        : DEFAULT_DIAGRAM_SETTINGS.blockMargin,
    blockText: (BLOCK_TEXT_MODES as readonly unknown[]).includes(d.blockText)
      ? (d.blockText as BlockTextMode)
      : DEFAULT_DIAGRAM_SETTINGS.blockText,
    layout: parseLayout(d.layout),
  };
}

export function parseTemplateModes(raw: unknown): Partial<Record<TemplateSection, TemplateMode>> {
  const out: Partial<Record<TemplateSection, TemplateMode>> = {};
  if (!raw || typeof raw !== "object") return out;
  const t = raw as Record<string, unknown>;
  for (const section of TEMPLATE_SECTIONS) {
    const mode = t[section];
    if ((TEMPLATE_MODES as readonly unknown[]).includes(mode)) out[section] = mode as TemplateMode;
  }
  return out;
}

/**
 * The canonical text for what `text` holds: parsed, every missing field
 * filled with its default, formatted. What a connect writes back — so a
 * repository keeps the values it chose and still gains any key a newer
 * version of the app added.
 */
export function normalizeRepoSettingsText(text: string | null): string {
  return repoSettingsJson(parseRepoSettings(text));
}

/** True when `text` is already canonical: nothing to add or reformat. */
export function isCurrentRepoSettings(text: string | null): boolean {
  return text !== null && normalizeRepoSettingsText(text) === text;
}
