/**
 * Pull requests.
 *
 * Every merge goes through `assertMergeTarget`, so the illegal transition the
 * branch model exists to prevent — `tmp-* -> main`, unreviewed work landing
 * straight in production and in a public release URL — cannot be expressed by
 * any caller of this package, in either app.
 */

import { assertMergeTarget } from "./branch-model.ts";
import { GitHubConflictError } from "./errors.ts";
import type { RestClient } from "./rest.ts";
import type { RepoRef } from "./types.ts";

export interface PullRequest {
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  head: string;
  base: string;
  /** Commit shas, needed to render the same file on both sides of the change. */
  headSha: string;
  baseSha: string;
  htmlUrl: string;
  draft: boolean;
  author: string | null;
}

export type FileChange = "added" | "modified" | "removed" | "renamed";

export interface PullFile {
  path: string;
  /** Set only for a rename, so the previous version can still be read. */
  previousPath: string | null;
  status: FileChange;
  additions: number;
  deletions: number;
}

interface RawPull {
  number: number;
  title: string;
  state: "open" | "closed";
  merged?: boolean;
  merged_at?: string | null;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  html_url: string;
  draft?: boolean;
  user?: { login?: string } | null;
}

function toPull(raw: RawPull): PullRequest {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state,
    merged: raw.merged ?? Boolean(raw.merged_at),
    head: raw.head.ref,
    base: raw.base.ref,
    headSha: raw.head.sha,
    baseSha: raw.base.sha,
    htmlUrl: raw.html_url,
    draft: raw.draft ?? false,
    author: raw.user?.login ?? null,
  };
}

export type MergeMethod = "merge" | "squash" | "rebase";

export function createPullsApi(rest: RestClient, repo: RepoRef) {
  const base = `/repos/${repo.owner}/${repo.repo}`;

  return {
    async createPullRequest(opts: {
      head: string;
      base: string;
      title: string;
      body?: string;
      draft?: boolean;
    }): Promise<PullRequest> {
      // Refuse before the request, not after: a rejected PR still notifies
      // reviewers and leaves a closed PR behind.
      assertMergeTarget(opts.head, opts.base);
      const raw = await rest.request<RawPull>(`${base}/pulls`, {
        method: "POST",
        body: {
          head: opts.head,
          base: opts.base,
          title: opts.title,
          body: opts.body ?? "",
          draft: opts.draft ?? false,
        },
      });
      return toPull(raw);
    },

    async listPullRequests(
      opts: { state?: "open" | "closed" | "all"; head?: string; base?: string } = {},
    ): Promise<PullRequest[]> {
      const params = new URLSearchParams({ state: opts.state ?? "open" });
      // GitHub wants `owner:branch` here, not a bare branch name.
      if (opts.head) params.set("head", `${repo.owner}:${opts.head}`);
      if (opts.base) params.set("base", opts.base);
      const raws = await rest.paginate<RawPull>(`${base}/pulls?${params}`);
      return raws.map(toPull);
    },

    async getPullRequest(number: number): Promise<PullRequest> {
      return toPull(await rest.request<RawPull>(`${base}/pulls/${number}`));
    },

    /**
     * Files a pull request touches.
     *
     * Only the paths and their status; the patch text is deliberately ignored,
     * because the point of rendering a review visually is that a unified diff of
     * DSL source is close to unreadable for anyone who is not the author.
     */
    async listPullFiles(number: number, opts: { onlyExt?: string } = {}): Promise<PullFile[]> {
      const raws = await rest.paginate<{
        filename: string;
        previous_filename?: string;
        status: string;
        additions: number;
        deletions: number;
      }>(`${base}/pulls/${number}/files`);

      return raws
        .filter((f) => !opts.onlyExt || f.filename.toLowerCase().endsWith(opts.onlyExt))
        .map((f) => ({
          path: f.filename,
          previousPath: f.previous_filename ?? null,
          // GitHub also reports "changed" and "unchanged"; treat anything that
          // is not a create/delete/rename as a modification.
          status: (["added", "removed", "renamed"].includes(f.status)
            ? f.status
            : "modified") as FileChange,
          additions: f.additions,
          deletions: f.deletions,
        }));
    },

    /**
     * PUT, not POST — and it 405s when the PR is not mergeable, which is how a
     * conflict surfaces. Translate that into something a user can act on.
     */
    async mergePullRequest(
      number: number,
      opts: { method?: MergeMethod; title?: string; expectedHeadSha?: string } = {},
    ): Promise<{ sha: string; merged: boolean }> {
      const pr = await this.getPullRequest(number);
      assertMergeTarget(pr.head, pr.base);

      try {
        const res = await rest.request<{ sha: string; merged: boolean }>(
          `${base}/pulls/${number}/merge`,
          {
            method: "PUT",
            body: {
              merge_method: opts.method ?? "merge",
              ...(opts.title ? { commit_title: opts.title } : {}),
              ...(opts.expectedHeadSha ? { sha: opts.expectedHeadSha } : {}),
            },
          },
        );
        return res;
      } catch (err) {
        if (err instanceof GitHubConflictError) {
          throw new GitHubConflictError(
            `Pull request #${number} cannot be merged automatically — ${pr.head} conflicts with ${pr.base}. ` +
              "Resolve it on GitHub, or locally, and try again.",
          );
        }
        throw err;
      }
    },
  };
}

export type PullsApi = ReturnType<typeof createPullsApi>;
