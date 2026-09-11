/**
 * Merge requests — read-only in phase 1.
 *
 * `listPullRequests` is real: `state.ts`'s `lockedBranches()` needs to see an
 * open MR to freeze its source branch, even though this app cannot yet
 * create or review one. Every write method throws `GitLabNotImplementedError`
 * so `apps/saas`'s central error mapper can turn it into a clear "not
 * available yet" message rather than a runtime crash — see the explicit
 * `provider !== "github"` guards on the review/publish routes, which should
 * mean these are never actually reached in phase 1, but a stub is cheap
 * insurance against a route that forgets the guard.
 */

import { GitLabNotImplementedError } from "./errors.ts";
import type { RestClient } from "./rest.ts";

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
  author: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  commentCount: number;
}

export interface IssueComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  htmlUrl: string;
}

interface RawMergeRequest {
  iid: number;
  title: string;
  description?: string | null;
  state: "opened" | "closed" | "merged" | "locked";
  source_branch: string;
  sha?: string | null;
  target_branch: string;
  diff_refs?: { base_sha?: string | null } | null;
  web_url: string;
  draft?: boolean;
  work_in_progress?: boolean;
  author?: { username: string } | null;
  created_at?: string;
  merged_at?: string | null;
  closed_at?: string | null;
  user_notes_count?: number;
}

function toPull(raw: RawMergeRequest): PullRequest {
  return {
    number: raw.iid,
    title: raw.title,
    body: raw.description ?? "",
    state: raw.state === "opened" ? "open" : "closed",
    merged: raw.state === "merged",
    head: raw.source_branch,
    headSha: raw.sha ?? "",
    base: raw.target_branch,
    baseSha: raw.diff_refs?.base_sha ?? "",
    htmlUrl: raw.web_url,
    draft: raw.draft ?? raw.work_in_progress ?? false,
    author: raw.author?.username ?? "",
    createdAt: raw.created_at ?? "",
    mergedAt: raw.merged_at ?? null,
    closedAt: raw.closed_at ?? null,
    commentCount: raw.user_notes_count ?? 0,
  };
}

function encodeProjectRef(projectId: number | string): string {
  return typeof projectId === "number" ? String(projectId) : encodeURIComponent(projectId);
}

function notImplemented(action: string): never {
  throw new GitLabNotImplementedError(
    `${action} is not yet available for GitLab projects — merge request review lands in a later release.`,
  );
}

export function createMergeRequestsApi(rest: RestClient, projectId: number | string) {
  const base = `/projects/${encodeProjectRef(projectId)}`;

  return {
    async listPullRequests(
      opts: { state?: "open" | "closed" | "all"; head?: string; base?: string } = {},
    ): Promise<PullRequest[]> {
      // GitLab's own `state=closed` excludes merged MRs, unlike GitHub's
      // `state=closed` (which includes them) — request everything and filter
      // client-side so callers see the same semantics either provider.
      const wantsOpen = (opts.state ?? "open") === "open";
      const params = new URLSearchParams({ state: wantsOpen ? "opened" : "all" });
      if (opts.head) params.set("source_branch", opts.head);
      if (opts.base) params.set("target_branch", opts.base);
      const raws = await rest.paginate<RawMergeRequest>(`${base}/merge_requests?${params}`);
      // `toPull` collapses GitLab's `closed`/`merged` into one `state:
      // "closed"` value (matching GitHub's PullRequest shape, which
      // distinguishes them via the separate `merged` boolean instead) — filter
      // on the raw state, before that collapse, so "closed" here means
      // GitLab's actual `closed`, not `closed OR merged`.
      const filtered = opts.state === "closed" ? raws.filter((r) => r.state === "closed") : raws;
      return filtered.map(toPull);
    },

    async getPullRequest(_number: number): Promise<PullRequest> {
      notImplemented("Viewing merge request details");
    },

    async createPullRequest(_opts: {
      head: string;
      base: string;
      title: string;
      body?: string;
      draft?: boolean;
    }): Promise<PullRequest> {
      notImplemented("Opening a merge request");
    },

    async closePullRequest(_number: number): Promise<PullRequest> {
      notImplemented("Closing a merge request");
    },

    async listIssueComments(_number: number): Promise<IssueComment[]> {
      notImplemented("Merge request comments");
    },

    async createIssueComment(_number: number, _body: string): Promise<IssueComment> {
      notImplemented("Commenting on a merge request");
    },

    async mergePullRequest(
      _number: number,
      _opts: {
        method?: "merge" | "squash" | "rebase";
        title?: string;
        expectedHeadSha?: string;
      } = {},
    ): Promise<{ sha: string; merged: boolean }> {
      notImplemented("Merging a merge request");
    },
  };
}

export type PullsApi = ReturnType<typeof createMergeRequestsApi>;
