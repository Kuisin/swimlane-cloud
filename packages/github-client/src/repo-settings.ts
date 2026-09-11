/**
 * `swimlane-settings.json` — one place to manage how the app treats a
 * repository.
 *
 * Distinct from `.swimlane.json`, which answers "where are the diagrams and
 * what do they look like" and is read on every page load. This file answers
 * "what is allowed to happen here": the branch model, and which sources may
 * reach the published branch.
 *
 * It is deliberately data rather than code, because the guard workflow reads
 * it too (`main-guard.ts`). Editing the allowed sources here changes what
 * GitHub enforces on the next pull request — without regenerating the
 * workflow, and without going through this app at all.
 */

import { INTEGRATION_BRANCH, PROD_BRANCH } from "./branch-model.ts";

export const REPO_SETTINGS_PATH = "swimlane-settings.json";

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
}

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
  };
}

/** True when `text` already parses to exactly the settings given. */
export function isCurrentRepoSettings(text: string | null, settings = DEFAULT_SETTINGS): boolean {
  return text !== null && JSON.stringify(parseRepoSettings(text)) === JSON.stringify(settings);
}
