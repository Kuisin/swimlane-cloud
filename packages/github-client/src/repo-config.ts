/**
 * `.swimlane.json`, committed at the repo root.
 *
 * The hub is stateless — no database, so nowhere to record which folder holds a
 * repo's diagrams. Putting it in the repo solves that and is better than a
 * server-side setting anyway: the config is versioned with the content, a tag
 * carries the config it was released with, and the VS Code extension reads the
 * exact same file. Absent config is normal, not an error.
 */

import { INTEGRATION_BRANCH } from "./branch-model.ts";

export interface RepoConfig {
  /** POSIX folder the diagram tree is rooted at. "" means the whole repo. */
  diagramsRoot: string;
  /** Display name; falls back to the repo name. */
  title: string | null;
  themeKey: string;
  /** Overridable for teams whose staging branch is not called `preview`. */
  integrationBranch: string;
}

export const DEFAULT_REPO_CONFIG: RepoConfig = {
  diagramsRoot: "",
  title: null,
  themeKey: "basic",
  integrationBranch: INTEGRATION_BRANCH,
};

export const REPO_CONFIG_PATH = ".swimlane.json";

function normalizeRoot(value: string): string {
  return value.replace(/^\.?\/+/, "").replace(/\/+$/, "");
}

/**
 * Parse leniently: a malformed or partial config degrades to defaults rather
 * than taking down a page. A viewer should still see the diagram when someone
 * fat-fingers the JSON.
 */
export function parseRepoConfig(raw: string | null): RepoConfig {
  if (!raw) return { ...DEFAULT_REPO_CONFIG };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_REPO_CONFIG };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ...DEFAULT_REPO_CONFIG };
  }

  const obj = data as Record<string, unknown>;
  const str = (key: string): string | null =>
    typeof obj[key] === "string" ? (obj[key] as string) : null;

  const root = str("diagramsRoot");
  const title = str("title");
  const themeKey = str("themeKey");
  const integration = str("integrationBranch");

  return {
    diagramsRoot: root === null ? DEFAULT_REPO_CONFIG.diagramsRoot : normalizeRoot(root),
    title: title && title.trim() ? title.trim() : null,
    themeKey: themeKey && themeKey.trim() ? themeKey.trim() : DEFAULT_REPO_CONFIG.themeKey,
    integrationBranch:
      integration && integration.trim()
        ? integration.trim()
        : DEFAULT_REPO_CONFIG.integrationBranch,
  };
}

/** True when `path` is inside the configured diagrams root. */
export function isWithinRoot(config: RepoConfig, path: string): boolean {
  if (!config.diagramsRoot) return true;
  return path === config.diagramsRoot || path.startsWith(`${config.diagramsRoot}/`);
}
