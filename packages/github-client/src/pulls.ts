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
  body: string;
  state: "open" | "closed";
  merged: boolean;
  head: string;
  headSha: string;
  base: string;
  baseSha: string;
  htmlUrl: string;
  draft: boolean;
  /** GitHub login of the author. */
  author: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  /** Issue comments. Only populated by `getPullRequest`; the list endpoint omits it. */
  commentCount: number;
}

export interface IssueComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  htmlUrl: string;
}

interface RawPull {
  number: number;
  title: string;
  body?: string | null;
  state: "open" | "closed";
  merged?: boolean;
  merged_at?: string | null;
  closed_at?: string | null;
  created_at?: string;
  head: { ref: string; sha?: string };
  base: { ref: string; sha?: string };
  html_url: string;
  draft?: boolean;
  user?: { login: string } | null;
  comments?: number;
}

interface RawComment {
  id: number;
  body: string;
  created_at: string;
  html_url: string;
  user?: { login: string } | null;
}

function toPull(raw: RawPull): PullRequest {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? "",
    state: raw.state,
    merged: raw.merged ?? Boolean(raw.merged_at),
    head: raw.head.ref,
    headSha: raw.head.sha ?? "",
    base: raw.base.ref,
    baseSha: raw.base.sha ?? "",
    htmlUrl: raw.html_url,
    draft: raw.draft ?? false,
    author: raw.user?.login ?? "",
    createdAt: raw.created_at ?? "",
    mergedAt: raw.merged_at ?? null,
    closedAt: raw.closed_at ?? null,
    commentCount: raw.comments ?? 0,
  };
}

function toComment(raw: RawComment): IssueComment {
  return {
    id: raw.id,
    author: raw.user?.login ?? "",
    body: raw.body,
    createdAt: raw.created_at,
    htmlUrl: raw.html_url,
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

    /** Closes without merging. The head branch is left alone for the caller to decide. */
    async closePullRequest(number: number): Promise<PullRequest> {
      const raw = await rest.request<RawPull>(`${base}/pulls/${number}`, {
        method: "PATCH",
        body: { state: "closed" },
      });
      return toPull(raw);
    },

    /**
     * A pull request is an issue, and its conversation lives on the issue
     * endpoints. (`/pulls/{n}/comments` is the *review* comment thread, which
     * is anchored to diff lines and not what a discussion needs.)
     */
    async listIssueComments(number: number): Promise<IssueComment[]> {
      const raws = await rest.paginate<RawComment>(`${base}/issues/${number}/comments`);
      return raws.map(toComment);
    },

    async createIssueComment(number: number, body: string): Promise<IssueComment> {
      const raw = await rest.request<RawComment>(`${base}/issues/${number}/comments`, {
        method: "POST",
        body: { body },
      });
      return toComment(raw);
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
