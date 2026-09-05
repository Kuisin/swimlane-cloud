/**
 * Writes, over the Git Data API.
 *
 * The porting delta from `apps/saas`'s Gitea client that matters: Gitea has a
 * batch-contents endpoint (`gitea.ts:269-321` posts every file in one call).
 * GitHub has no equivalent, so a multi-path commit — which is exactly what a
 * folder-level checkpoint is — has to be assembled by hand:
 *
 *   read ref -> create a blob per file -> create a tree on top of `base_tree`
 *   -> create a commit -> fast-forward the ref
 *
 * The last step is the one worth care. `PATCH /git/refs/*` defaults to
 * `force: false`, which makes it reject a non-fast-forward. Combined with
 * `expectedHeadSha` that gives real optimistic concurrency: two people
 * checkpointing the same branch cannot silently clobber each other.
 */

import { GitHubConflictError } from "./errors.ts";
import type { RestClient } from "./rest.ts";
import type { RepoRef, TreeEntry } from "./types.ts";

/** Regular non-executable file. The DSL is always plain text. */
const FILE_MODE = "100644";

export interface FileWrite {
  path: string;
  /** UTF-8 text. Deleting is expressed by omitting `text`. */
  text: string;
}

export interface CommitResult {
  sha: string;
  treeSha: string;
  branch: string;
}

export interface CommitFilesOptions {
  branch: string;
  message: string;
  files: FileWrite[];
  /**
   * Paths to remove in the same commit. A tree entry with `sha: null` deletes
   * the path — the only way to express a removal against `base_tree`, since an
   * omitted path is inherited rather than dropped.
   */
  deletions?: string[];
  /**
   * Refuse the write unless the branch still points here. Omit only when the
   * caller genuinely does not care what it is overwriting.
   */
  expectedHeadSha?: string;
  author?: { name: string; email: string };
}

function repoBase(repo: RepoRef): string {
  return `/repos/${repo.owner}/${repo.repo}`;
}

export function createWriteApi(rest: RestClient, repo: RepoRef) {
  const base = repoBase(repo);

  async function refSha(ref: string): Promise<string> {
    const data = await rest.request<{ object: { sha: string } }>(
      `${base}/git/ref/heads/${encodeURIComponent(ref)}`,
    );
    return data.object.sha;
  }

  return {
    refSha,

    /** Two calls: GitHub has no "branch from branch" endpoint. */
    async createBranch(name: string, fromRef: string): Promise<string> {
      const from = await refSha(fromRef);
      await rest.request(`${base}/git/refs`, {
        method: "POST",
        body: { ref: `refs/heads/${name}`, sha: from },
      });
      return from;
    },

    /** Idempotent: a 422 here means the branch already exists, which is success. */
    async ensureBranch(name: string, fromRef: string): Promise<void> {
      try {
        await refSha(name);
        return;
      } catch {
        /* does not exist yet */
      }
      try {
        const from = await refSha(fromRef);
        await rest.request(`${base}/git/refs`, {
          method: "POST",
          body: { ref: `refs/heads/${name}`, sha: from },
        });
      } catch (err) {
        if (err instanceof GitHubConflictError) return;
        throw err;
      }
    },

    /**
     * One commit spanning any number of paths — the folder-level checkpoint the
     * domain model calls for.
     */
    async commitFiles(options: CommitFilesOptions): Promise<CommitResult> {
      const { branch, message, files, deletions = [], expectedHeadSha, author } = options;
      if (files.length === 0 && deletions.length === 0) {
        throw new Error("commitFiles called with no files");
      }

      const head = await refSha(branch);
      if (expectedHeadSha && head !== expectedHeadSha) {
        throw new GitHubConflictError(
          `${branch} has moved on (expected ${expectedHeadSha.slice(0, 7)}, found ${head.slice(0, 7)}). ` +
            "Someone else committed while you were editing.",
        );
      }

      const headCommit = await rest.request<{ tree: { sha: string } }>(
        `${base}/git/commits/${head}`,
        { immutable: true },
      );

      // `encoding: "utf-8"` avoids base64 entirely, which matters because this
      // package has no Buffer and must run in a browser too.
      const blobs = await Promise.all(
        files.map(async (f) => {
          const blob = await rest.request<{ sha: string }>(`${base}/git/blobs`, {
            method: "POST",
            body: { content: f.text, encoding: "utf-8" },
          });
          return { path: f.path, mode: FILE_MODE, type: "blob" as const, sha: blob.sha };
        }),
      );

      const removals = deletions.map((path) => ({
        path,
        mode: FILE_MODE,
        type: "blob" as const,
        sha: null,
      }));

      // `base_tree` makes this a delta: every path not listed is inherited.
      // Without it the commit would delete the rest of the repository.
      const tree = await rest.request<{ sha: string }>(`${base}/git/trees`, {
        method: "POST",
        body: { base_tree: headCommit.tree.sha, tree: [...blobs, ...removals] },
      });

      const commit = await rest.request<{ sha: string }>(`${base}/git/commits`, {
        method: "POST",
        body: {
          message,
          tree: tree.sha,
          parents: [head],
          ...(author ? { author, committer: author } : {}),
        },
      });

      try {
        await rest.request(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, {
          method: "PATCH",
          // Never force. A rejected non-fast-forward is the whole safety net.
          body: { sha: commit.sha, force: false },
        });
      } catch (err) {
        if (err instanceof GitHubConflictError) {
          throw new GitHubConflictError(
            `Could not update ${branch}: it moved while the commit was being built. Nothing was lost — retry.`,
          );
        }
        throw err;
      }

      return { sha: commit.sha, treeSha: tree.sha, branch };
    },

    /** Single-file write via the Contents API. Always PUT, create or update. */
    async putFile(path: string, text: string, branch: string, message: string): Promise<string> {
      let sha: string | undefined;
      try {
        const existing = await rest.request<{ sha: string }>(
          `${base}/contents/${path}?ref=${encodeURIComponent(branch)}`,
        );
        sha = existing.sha;
      } catch {
        /* creating */
      }
      const res = await rest.request<{ commit: { sha: string } }>(`${base}/contents/${path}`, {
        method: "PUT",
        body: {
          message,
          // The Contents API takes base64 only, unlike the blob endpoint.
          content: base64Utf8(text),
          branch,
          ...(sha ? { sha } : {}),
        },
      });
      return res.commit.sha;
    },

    /** Lightweight tag. Releases are cut from `main` only. */
    async createTag(tag: string, sha: string): Promise<void> {
      await rest.request(`${base}/git/refs`, {
        method: "POST",
        body: { ref: `refs/tags/${tag}`, sha },
      });
    },

    async createRelease(tag: string, opts: { name?: string; body?: string; target?: string } = {}) {
      return rest.request<{ id: number; html_url: string; tag_name: string }>(`${base}/releases`, {
        method: "POST",
        body: {
          tag_name: tag,
          name: opts.name ?? tag,
          body: opts.body ?? "",
          ...(opts.target ? { target_commitish: opts.target } : {}),
        },
      });
    },

    async listTree(
      sha: string,
      recursive = true,
    ): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
      const data = await rest.request<{
        tree: Array<{ path: string; type: string; sha: string; size?: number }>;
        truncated: boolean;
      }>(`${base}/git/trees/${sha}${recursive ? "?recursive=1" : ""}`, { immutable: true });

      return {
        entries: data.tree.map((e) => ({
          path: e.path,
          type: e.type as TreeEntry["type"],
          sha: e.sha,
          ...(e.size === undefined ? {} : { size: e.size }),
        })),
        // A huge repo silently truncates at 100k entries; callers must know.
        truncated: data.truncated,
      };
    },
  };
}

export type WriteApi = ReturnType<typeof createWriteApi>;

/** Base64 without Buffer, so this file stays runnable outside Node. */
function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
