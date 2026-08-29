/**
 * Resolving which branches this repository actually uses.
 *
 * The shared branch model supplies defaults (`main` / `test`), but they are
 * only defaults. An arbitrary repository very often has neither: its production
 * branch may be `master` or `trunk`, and a `test` branch usually does not exist
 * at all. Hardcoding the constants made "Start Edit" fail on the common case,
 * and made its own recovery path fail too — `git branch test main` errors with
 * "not a valid object name: 'main'" in a repo that never had one.
 *
 * Resolution order, most specific first:
 *   1. `.swimlane.json` in the repo — versioned, shared by everyone
 *   2. VS Code settings — per user
 *   3. the repository itself, for production: origin/HEAD, else a local branch
 *      that looks like a default, else the current branch
 *   4. the shared constants
 */

import * as vscode from "vscode";
import { INTEGRATION_BRANCH, PROD_BRANCH } from "@swimlane-cloud/github-client";
import type { Git } from "./git-cli";

export interface BranchConfig {
  production: string;
  integration: string;
  /** True when production was inferred from the repo rather than configured. */
  productionInferred: boolean;
}

/** Common default-branch names, most likely first. */
const LIKELY_DEFAULTS = ["main", "master", "trunk", "develop"];

export async function resolveBranches(
  git: Git,
  root: string,
  repoConfig: { integrationBranch?: string } | null,
): Promise<BranchConfig> {
  const settings = vscode.workspace.getConfiguration("swimlane");

  const configuredIntegration =
    repoConfig?.integrationBranch?.trim() ||
    settings.get<string>("integrationBranch", "").trim() ||
    INTEGRATION_BRANCH;

  const configuredProduction = settings.get<string>("productionBranch", "").trim();
  if (configuredProduction) {
    return {
      production: configuredProduction,
      integration: configuredIntegration,
      productionInferred: false,
    };
  }

  return {
    production: await detectDefaultBranch(git, root),
    integration: configuredIntegration,
    productionInferred: true,
  };
}

/**
 * What this repository treats as its production branch.
 *
 * `origin/HEAD` is authoritative when present, but it is only populated by a
 * clone or an explicit `set-head`, so a locally-initialised repo needs the
 * fallbacks.
 */
export async function detectDefaultBranch(git: Git, root: string): Promise<string> {
  const originHead = await git.run(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
    cwd: root,
    allowFailure: true,
  });
  if (originHead.code === 0) {
    const name = originHead.stdout.trim().replace(/^origin\//, "");
    if (name) return name;
  }

  for (const candidate of LIKELY_DEFAULTS) {
    if (await branchExists(git, root, candidate)) return candidate;
  }

  // Whatever is checked out is a better guess than a constant the repo may not have.
  return (await git.currentBranch(root)) ?? PROD_BRANCH;
}

export async function branchExists(git: Git, root: string, name: string): Promise<boolean> {
  const res = await git.run(["rev-parse", "--verify", "--quiet", `refs/heads/${name}`], {
    cwd: root,
    allowFailure: true,
  });
  return res.code === 0 && res.stdout.trim().length > 0;
}
