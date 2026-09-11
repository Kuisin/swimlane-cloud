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

export { REPO_SETTINGS_PATH } from "./repo-paths.ts";

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

/** Render settings every diagram inherits; a file's own `/option/` wins. */
export interface DiagramSettings {
  /** The fork circles and join diamonds. Off, the rails simply meet. */
  showGatewayIcons: boolean;
  /** Extra pixels of height on every step row. */
  blockMargin: number;
  /** A step's box text: cut to one line with an ellipsis, or wrapped. */
  blockText: BlockTextMode;
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
}

export const DEFAULT_DIAGRAM_SETTINGS: DiagramSettings = {
  showGatewayIcons: true,
  blockMargin: 0,
  blockText: "truncate",
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
};

export function repoSettingsJson(settings: SwimlaneSettings = DEFAULT_SETTINGS): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/**
 * Read the file, falling back to the defaults for anything absent or
 * malformed. A broken settings file must not be able to *weaken* the rules, so
 * every missing field takes the default rather than being treated as "off".
 */
export function parseRepoSettings(text: string | null): SwimlaneSettings {
  if (!text) return DEFAULT_SETTINGS;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
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
  };
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
