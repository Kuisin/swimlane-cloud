/**
 * Branch protection for `main`.
 *
 * The branch model in `branch-model.ts` is enforced entirely client-side: it
 * stops *this app* asking for an illegal merge, but a `git push` from anyone's
 * laptop walks straight past it. This module is the server-side half — GitHub
 * itself refusing a direct push to `main`.
 *
 * Two things are deliberately *not* required, because both would break the
 * app's own publishing:
 *
 * - **No required approvals** (`required_approving_review_count: 0`). A PR is
 *   still mandatory, but `promoteVersion` merges its own `release-*` pull
 *   request unattended; requiring an approver would 405 every publish.
 * - **No required status checks.** Making the guard workflow *required* needs
 *   the checks to have reported at least once, and on a plan without rulesets
 *   there is nothing to attach them to anyway.
 *
 * Protection is a paid feature for private repositories. A free-plan private
 * repo answers 403 to every endpoint here, which is reported rather than
 * thrown: connecting a repository must not fail because its plan cannot hold a
 * rule.
 */

import { GitHubNotAccessibleError } from "./errors.ts";
import type { RestClient } from "./rest.ts";
import { PROD_BRANCH } from "./branch-model.ts";
import type { RepoRef } from "./types.ts";

/** What actually happened, so a caller can tell the user the truth. */
export type ProtectionOutcome =
  | { status: "applied" }
  /** The plan does not include protection for this repository (403). */
  | { status: "unavailable"; reason: string }
  /** The token may not administer this repository. */
  | { status: "forbidden"; reason: string };

function repoBase(repo: RepoRef): string {
  return `/repos/${repo.owner}/${repo.repo}`;
}

/**
 * Require a pull request to change `main`, and forbid force-pushes and
 * deletion.
 *
 * `enforce_admins` is on: "force this" is the whole point, and an admin who
 * genuinely needs to bypass can turn it off in the repository's settings. Every
 * write this app makes to `main` at connect time happens *before* this is
 * applied, so ordering — not an exemption — is what keeps connect working.
 */
export function createProtectionApi(rest: RestClient, repo: RepoRef) {
  const base = repoBase(repo);

  async function protectBranchForPullRequests(
    branch: string = PROD_BRANCH,
  ): Promise<ProtectionOutcome> {
    try {
      await rest.request(`${base}/branches/${encodeURIComponent(branch)}/protection`, {
        method: "PUT",
        body: {
          required_status_checks: null,
          enforce_admins: true,
          required_pull_request_reviews: {
            required_approving_review_count: 0,
            dismiss_stale_reviews: false,
            require_code_owner_reviews: false,
          },
          restrictions: null,
          allow_force_pushes: false,
          allow_deletions: false,
        },
      });
      return { status: "applied" };
    } catch (err) {
      // 403 covers both "upgrade to GitHub Pro" on a private repo and "you are
      // not an admin here". The message distinguishes them for the user, and
      // neither is a reason to fail whatever called this.
      if (err instanceof GitHubNotAccessibleError && (err.status === 403 || err.status === 404)) {
        const reason = err.message || "GitHub refused to set branch protection.";
        return /upgrade/i.test(reason)
          ? { status: "unavailable", reason }
          : { status: "forbidden", reason };
      }
      throw err;
    }
  }

  return { protectBranchForPullRequests };
}

export type ProtectionApi = ReturnType<typeof createProtectionApi>;
