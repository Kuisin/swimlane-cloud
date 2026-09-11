/**
 * Commit history and comparison.
 *
 * GitLab's `/repository/compare` returns the commit list and diff between two
 * refs but, unlike GitHub's `/compare/{base}...{head}`, no `ahead_by`/
 * `behind_by`/`status` — those have to be reconstructed from two calls (the
 * pair swapped), which is why `compare` here costs twice what it does on
 * GitHub. Only the one route that needs it
 * (`/api/projects/[projectId]/compare`) should call this; nothing in phase 1
 * ports `isAncestor` (GitHub-client's version), since that's reached only
 * from the GitHub-only publish flow.
 */

import { GitLabNotImplementedError } from "./errors.ts";
import type { RestClient } from "./rest.ts";

export type ChangedFileStatus =
  "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";

export interface ChangedFile {
  path: string;
  status: ChangedFileStatus;
  previousPath?: string;
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: { name: string; login: string | null; date: string };
  htmlUrl: string;
  parents: string[];
}

export interface CompareResult {
  status: "identical" | "ahead" | "behind" | "diverged";
  aheadBy: number;
  behindBy: number;
  /** Where `from` and `to` diverged — GitLab's `commit` field on the compare response. */
  mergeBaseSha: string;
  files: ChangedFile[];
  /** Commits reachable from `to` but not `from`, oldest first. */
  commits: CommitSummary[];
}

interface RawCommit {
  id: string;
  message: string;
  author_name: string;
  authored_date: string;
  web_url?: string;
  parent_ids: string[];
}

interface RawDiff {
  old_path: string;
  new_path: string;
  new_file: boolean;
  deleted_file: boolean;
  renamed_file: boolean;
}

interface RawCompare {
  commit?: { id: string } | null;
  commits: RawCommit[];
  diffs: RawDiff[];
}

function projectWebUrlFallback(base: string, sha: string): string {
  return `${base}/-/commit/${sha}`;
}

function toCommit(raw: RawCommit, base: string): CommitSummary {
  return {
    sha: raw.id,
    message: raw.message,
    author: { name: raw.author_name ?? "", login: null, date: raw.authored_date ?? "" },
    htmlUrl: raw.web_url ?? projectWebUrlFallback(base, raw.id),
    parents: raw.parent_ids ?? [],
  };
}

function toFile(raw: RawDiff): ChangedFile {
  const status: ChangedFileStatus = raw.new_file
    ? "added"
    : raw.deleted_file
      ? "removed"
      : raw.renamed_file
        ? "renamed"
        : "modified";
  return {
    path: raw.new_path,
    status,
    ...(raw.renamed_file && raw.old_path !== raw.new_path ? { previousPath: raw.old_path } : {}),
  };
}

function encodeProjectRef(projectId: number | string): string {
  return typeof projectId === "number" ? String(projectId) : encodeURIComponent(projectId);
}

export function createCommitsApi(rest: RestClient, projectId: number | string) {
  const base = `/projects/${encodeProjectRef(projectId)}`;

  async function rawCompare(from: string, to: string): Promise<RawCompare> {
    return rest.request<RawCompare>(
      `${base}/repository/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { immutable: false },
    );
  }

  return {
    async listCommits(
      ref: string,
      opts: { perPage?: number; page?: number } = {},
    ): Promise<CommitSummary[]> {
      const params = new URLSearchParams({
        ref_name: ref,
        per_page: String(opts.perPage ?? 30),
        page: String(opts.page ?? 1),
      });
      const raws = await rest.request<RawCommit[]>(`${base}/repository/commits?${params}`);
      return raws.map((r) => toCommit(r, base));
    },

    async getCommit(sha: string): Promise<CommitSummary & { files: ChangedFile[] }> {
      const [commit, diff] = await Promise.all([
        rest.request<RawCommit>(`${base}/repository/commits/${sha}`),
        rest.request<RawDiff[]>(`${base}/repository/commits/${sha}/diff`),
      ]);
      return { ...toCommit(commit, base), files: diff.map(toFile) };
    },

    /**
     * Reconstructs GitHub-shaped ahead/behind/status from two compare calls,
     * since GitLab's compare endpoint reports neither directly. `files`/
     * `commits` come from the primary (`from`→`to`) direction only.
     */
    async compare(from: string, to: string): Promise<CompareResult> {
      const [forward, backward] = await Promise.all([rawCompare(from, to), rawCompare(to, from)]);
      const aheadBy = forward.commits.length;
      const behindBy = backward.commits.length;
      const status: CompareResult["status"] =
        aheadBy === 0 && behindBy === 0
          ? "identical"
          : behindBy === 0
            ? "ahead"
            : aheadBy === 0
              ? "behind"
              : "diverged";
      return {
        status,
        aheadBy,
        behindBy,
        mergeBaseSha: forward.commit?.id ?? from,
        files: forward.diffs.map(toFile),
        commits: forward.commits.map((c) => toCommit(c, base)),
      };
    },

    /**
     * Not ported: only the GitHub-only publish flow (`versions.ts`) calls
     * this, gated behind an explicit `provider !== "github"` guard before
     * any `ProjectCtx` method is reached — this stub exists only so that
     * shared `ProjectCtx` type-checks for every route, not because it can
     * ever run for a GitLab project in phase 1.
     */
    async isAncestor(_sha: string, _ref: string): Promise<boolean> {
      throw new GitLabNotImplementedError(
        "isAncestor is not available for GitLab projects — this method should be unreachable here.",
      );
    },
  };
}

export type CommitsApi = ReturnType<typeof createCommitsApi>;
