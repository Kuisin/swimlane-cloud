/**
 * Cross-provider error predicates. `GitHubNotAccessibleError`/
 * `GitHubConflictError` and `GitLabNotAccessibleError`/`GitLabConflictError`
 * mean the same thing to a caller — "not visible with this token" and "the
 * branch moved under us" — so callers that only care about the condition,
 * not which provider raised it, use these instead of an `instanceof` per
 * provider.
 */
import { GitHubConflictError, GitHubNotAccessibleError } from "@swimlane-cloud/github-client";
import { GitLabConflictError, GitLabNotAccessibleError } from "@swimlane-cloud/gitlab-client";

export function isRepoNotAccessible(
  err: unknown,
): err is GitHubNotAccessibleError | GitLabNotAccessibleError {
  return err instanceof GitHubNotAccessibleError || err instanceof GitLabNotAccessibleError;
}

export function isRepoConflict(err: unknown): err is GitHubConflictError | GitLabConflictError {
  return err instanceof GitHubConflictError || err instanceof GitLabConflictError;
}
