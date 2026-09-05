/**
 * Writes, over GitLab's commit-actions API.
 *
 * GitHub's Git Data API forces a multi-step blob/tree/commit dance (see
 * `@swimlane-cloud/github-client/write`'s header comment); GitLab has a
 * single `POST /repository/commits` endpoint that takes an `actions` array
 * and applies them all in one commit, including on a project with no
 * branches yet — the same shape `apps/saas`'s prior Gitea client used.
 *
 * The one thing GitHub's Git Data API gives that this cannot: an atomic,
 * server-enforced fast-forward-only ref update. GitLab has no equivalent
 * guard on `commitFiles`, so this checks the branch tip immediately before
 * building the commit and throws on a mismatch — check-then-act, not a true
 * compare-and-swap. Acceptable for phase 1 (see the plan's flagged risks).
 */

import { GitLabConflictError } from "./errors.ts";
import type { RestClient } from "./rest.ts";
import type { TreeEntry } from "./types.ts";

export interface FileWrite {
  path: string;
  text: string;
}

export interface CommitResult {
  sha: string;
  branch: string;
}

export interface CommitFilesOptions {
  branch: string;
  message: string;
  files: FileWrite[];
  deletions?: string[];
  /** Refuse the write unless the branch still points here (omit on a branch with no commits yet). */
  expectedHeadSha?: string;
  author?: { name: string; email: string };
}

function encodeProjectRef(projectId: number | string): string {
  return typeof projectId === "number" ? String(projectId) : encodeURIComponent(projectId);
}

export function createWriteApi(rest: RestClient, projectId: number | string) {
  const base = `/projects/${encodeProjectRef(projectId)}`;

  async function refSha(branch: string): Promise<string> {
    const data = await rest.request<{ commit: { id: string } }>(
      `${base}/repository/branches/${encodeURIComponent(branch)}`,
    );
    return data.commit.id;
  }

  /** True when the project has at least one branch (i.e. at least one commit). */
  async function hasAnyBranch(): Promise<boolean> {
    const branches = await rest.request<unknown[]>(`${base}/repository/branches?per_page=1`);
    return branches.length > 0;
  }

  return {
    refSha,

    async createBranch(name: string, fromRef: string): Promise<string> {
      const data = await rest.request<{ commit: { id: string } }>(
        `${base}/repository/branches?branch=${encodeURIComponent(name)}&ref=${encodeURIComponent(fromRef)}`,
        { method: "POST" },
      );
      return data.commit.id;
    },

    /** Idempotent: GitLab 400s "Branch already exists" on retry, which is success. */
    async ensureBranch(name: string, fromRef: string): Promise<void> {
      try {
        await refSha(name);
        return;
      } catch {
        /* does not exist yet */
      }
      try {
        await rest.request(
          `${base}/repository/branches?branch=${encodeURIComponent(name)}&ref=${encodeURIComponent(fromRef)}`,
          { method: "POST" },
        );
      } catch (err) {
        if (err instanceof GitLabConflictError) return;
        throw err;
      }
    },

    /**
     * One commit spanning any number of paths. Building the `actions` array
     * requires knowing which paths already exist on the branch (GitLab
     * requires each action tagged `create` or `update`) — skipped entirely
     * when the branch has no commits yet, since every path is then a create.
     */
    async commitFiles(options: CommitFilesOptions): Promise<CommitResult> {
      const { branch, message, files, deletions = [], expectedHeadSha, author } = options;
      if (files.length === 0 && deletions.length === 0) {
        throw new Error("commitFiles called with no files");
      }

      const branchExists = await hasAnyBranch();
      let existingPaths = new Set<string>();
      if (branchExists) {
        const head = await refSha(branch);
        if (expectedHeadSha && head !== expectedHeadSha) {
          throw new GitLabConflictError(
            `${branch} has moved on (expected ${expectedHeadSha.slice(0, 7)}, found ${head.slice(0, 7)}). ` +
              "Someone else committed while you were editing.",
          );
        }
        const tree = await rest.paginate<{ path: string; type: string }>(
          `${base}/repository/tree?ref=${encodeURIComponent(branch)}&recursive=true`,
          { max: 100 },
        );
        existingPaths = new Set(tree.filter((t) => t.type === "blob").map((t) => t.path));
      }

      const actions = [
        ...files.map((f) => ({
          action: existingPaths.has(f.path) ? "update" : "create",
          file_path: f.path,
          content: f.text,
        })),
        ...deletions.map((path) => ({ action: "delete", file_path: path })),
      ];

      try {
        const commit = await rest.request<{ id: string }>(`${base}/repository/commits`, {
          method: "POST",
          body: {
            branch,
            commit_message: message,
            actions,
            ...(author ? { author_name: author.name, author_email: author.email } : {}),
          },
        });
        return { sha: commit.id, branch };
      } catch (err) {
        if (err instanceof GitLabConflictError) {
          throw new GitLabConflictError(
            `Could not update ${branch}: it moved while the commit was being built. Nothing was lost — retry.`,
          );
        }
        throw err;
      }
    },

    /** Single-file write. Always POST-or-PUT, create or update. */
    async putFile(path: string, text: string, branch: string, message: string): Promise<string> {
      const encodedPath = encodeURIComponent(path);
      let exists = true;
      try {
        await rest.request(
          `${base}/repository/files/${encodedPath}?ref=${encodeURIComponent(branch)}`,
        );
      } catch {
        exists = false;
      }
      const res = await rest.request<{ branch: string }>(
        `${base}/repository/files/${encodedPath}`,
        {
          method: exists ? "PUT" : "POST",
          body: { branch, content: text, commit_message: message },
        },
      );
      // GitLab's file-write response doesn't carry the resulting commit sha
      // directly; the branch tip after this call is the sha callers want.
      return refSha(res.branch ?? branch);
    },

    /** GitLab's raw-file endpoint. Returns null on a missing path rather than throwing. */
    async readFile(path: string, ref: string): Promise<string | null> {
      try {
        return await rest.requestText(
          `${base}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`,
          { noEtag: true },
        );
      } catch (err) {
        if ((err as { status?: number }).status === 404) return null;
        throw err;
      }
    },

    async listTree(
      sha: string,
      recursive = true,
    ): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
      const raws = await rest.paginate<{ path: string; type: string; id: string }>(
        `${base}/repository/tree?ref=${encodeURIComponent(sha)}${recursive ? "&recursive=true" : ""}`,
        { max: 100 },
      );
      return {
        entries: raws.map((e) => ({
          path: e.path,
          type: e.type === "tree" ? "tree" : "blob",
          sha: e.id,
        })),
        // GitLab's tree endpoint paginates rather than truncating outright;
        // the 100-page cap above is generous but not unbounded, unlike a
        // single flag — callers should treat a full 100 pages as "verify".
        truncated: raws.length >= 100 * 100,
      };
    },
  };
}

export type WriteApi = ReturnType<typeof createWriteApi>;
