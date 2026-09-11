/**
 * The paths Swimlane Cloud manages inside a repository.
 *
 * Their own module because the files that *generate* those contents refer to
 * each other: `rule.md` documents the guard workflow,
 * and the guard workflow exempts `rule.md`. Holding the names here is what
 * keeps that from being an import cycle — which it briefly was, and which
 * failed at module-evaluation time rather than at the type level.
 */

import { REPO_CONFIG_PATH } from "./repo-config.ts";

export const MAIN_GUARD_WORKFLOW_PATH = ".github/workflows/swimlane-main-guard.yml";
export const REPO_RULES_PATH = "rule.md";
export const REPO_SETTINGS_PATH = "swimlane-settings.json";

/**
 * Files this app writes to `main` itself, when a project is connected.
 *
 * The push that introduces the guard workflow is itself a direct push to
 * `main`, so without an exemption the guard would fail on its own arrival.
 * Diagrams are deliberately absent: content still cannot reach `main` outside
 * the flow, only this app's own bookkeeping can.
 */
export const MANAGED_PATHS = [
  MAIN_GUARD_WORKFLOW_PATH,
  REPO_CONFIG_PATH,
  REPO_RULES_PATH,
  REPO_SETTINGS_PATH,
] as const;
