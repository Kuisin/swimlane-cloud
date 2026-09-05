/**
 * Commit history and comparison — the read side of the branch model.
 *
 * `compare` is the primitive the SaaS builds its guards on. "Is this sha on
 * `test`?" is not answerable from a commit listing without paging through
 * history; `GET /compare/{sha}...{test}` answers it in one call, because a
 * status of `ahead` or `identical` means `sha` is an ancestor of `test`'s tip.
 */

import { GitHubNotAccessibleError } from "./errors.ts";
import type { RestClient } from "./rest.ts";
import type { RepoRef } from "./types.ts";

const SHA_RE = /^[0-9a-f]{40}$/;

export interface CommitSummary {
  sha: string;
  message: string;
  author: {
    name: string;
    /** GitHub login when the commit email maps to an account; else null. */
    login: string | null;
    date: string;
  };
  htmlUrl: string;
  parents: string[];
}

export type ChangedFileStatus =
  "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";

export interface ChangedFile {
  path: string;
  status: ChangedFileStatus;
  /** Set for `renamed` and `copied`. */
  previousPath?: string;
}

export interface CompareResult {
  /** Relative position of `head` to `base`. */
  status: "identical" | "ahead" | "behind" | "diverged";
  aheadBy: number;
  behindBy: number;
  mergeBaseSha: string;
  /** Capped by GitHub at 300 entries. */
  files: ChangedFile[];
  /** Commits on `head` since the merge base, oldest first; capped at 250. */
  commits: CommitSummary[];
}

interface RawCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
  author: { login: string } | null;
  parents: Array<{ sha: string }>;
  files?: RawFile[];
}

interface RawFile {
  filename: string;
  status: ChangedFileStatus;
  previous_filename?: string;
}

function toCommit(raw: RawCommit): CommitSummary {
  return {
    sha: raw.sha,
    message: raw.commit.message,
    author: {
      name: raw.commit.author?.name ?? "",
      login: raw.author?.login ?? null,
      date: raw.commit.author?.date ?? "",
    },
    htmlUrl: raw.html_url,
    parents: raw.parents.map((p) => p.sha),
  };
}

function toFile(raw: RawFile): ChangedFile {
  return {
    path: raw.filename,
    status: raw.status,
    ...(raw.previous_filename ? { previousPath: raw.previous_filename } : {}),
  };
}

export function createCommitsApi(rest: RestClient, repo: RepoRef) {
  const base = `/repos/${repo.owner}/${repo.repo}`;

  async function compare(from: string, to: string): Promise<CompareResult> {
    const raw = await rest.request<{
      status: CompareResult["status"];
      ahead_by: number;
      behind_by: number;
      merge_base_commit: { sha: string };
      files?: RawFile[];
      commits: RawCommit[];
    }>(`${base}/compare/${encodeURIComponent(from)}...${encodeURIComponent(to)}`, {
      // Two shas name a fixed pair of trees; a branch name does not.
      immutable: SHA_RE.test(from) && SHA_RE.test(to),
    });
    return {
      status: raw.status,
      aheadBy: raw.ahead_by,
      behindBy: raw.behind_by,
      mergeBaseSha: raw.merge_base_commit.sha,
      files: (raw.files ?? []).map(toFile),
      commits: raw.commits.map(toCommit),
    };
  }

  return {
    /** One page of history for a ref, newest first. */
    async listCommits(
      ref: string,
      opts: { perPage?: number; page?: number } = {},
    ): Promise<CommitSummary[]> {
      const params = new URLSearchParams({
        sha: ref,
        per_page: String(opts.perPage ?? 30),
        page: String(opts.page ?? 1),
      });
      const raws = await rest.request<RawCommit[]>(`${base}/commits?${params}`);
      return raws.map(toCommit);
    },

    async getCommit(sha: string): Promise<CommitSummary & { files: ChangedFile[] }> {
      const raw = await rest.request<RawCommit>(`${base}/commits/${sha}`, {
        immutable: SHA_RE.test(sha),
      });
      return { ...toCommit(raw), files: (raw.files ?? []).map(toFile) };
    },

    compare,

    /**
     * True when `sha` is reachable from `ref` — the guard behind "only commits
     * on `test` may be flagged as a version". A 404 means the two share no
     * history at all, which is also a no.
     */
    async isAncestor(sha: string, ref: string): Promise<boolean> {
      try {
        const { status } = await compare(sha, ref);
        return status === "ahead" || status === "identical";
      } catch (err) {
        if (err instanceof GitHubNotAccessibleError && err.status === 404) return false;
        throw err;
      }
    },
  };
}

export type CommitsApi = ReturnType<typeof createCommitsApi>;
