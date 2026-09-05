/**
 * What is uncommitted on a branch, classified against the branch's current
 * tree so the Push modal and Request-review modal can show a plain "these
 * files will change" list instead of asking the user to imagine a diff.
 */
import type { RepoApis } from "./repo-apis";
import { loadDraftState } from "./repo-files";
import type { ChangeStatus, PendingChange } from "./types";

export type { ChangeStatus, PendingChange } from "./types";

export interface PendingChanges {
  /** The tree this was classified against; also the checkpoint's expectedHeadSha. */
  headSha: string;
  changes: PendingChange[];
  /** Pending edits, path → text (deleted paths excluded). */
  writes: Record<string, string>;
  /** Paths pending removal at the next checkpoint. */
  deletions: string[];
}

/** Added vs changed depends on whether the path already exists in `sha`'s tree. */
export async function classifyChanges(
  ctx: RepoApis,
  sha: string,
  writes: Record<string, string>,
  deletions: string[],
): Promise<PendingChange[]> {
  const paths = [...Object.keys(writes), ...deletions];
  let existing = new Set<string>();
  if (paths.length > 0) {
    const { entries } = await ctx.write.listTree(sha, true);
    existing = new Set(entries.filter((e) => e.type === "blob").map((e) => e.path));
  }

  return [
    ...Object.keys(writes).map((path) => ({
      path,
      status: (existing.has(path) ? "changed" : "added") as ChangeStatus,
    })),
    ...deletions.map((path) => ({ path, status: "removed" as ChangeStatus })),
  ].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Drafts + tombstones stored for `branch`, classified against the tree at
 * `headSha` (defaults to the branch's current tip).
 */
export async function listPendingChanges(
  ctx: RepoApis,
  projectId: string,
  branch: string,
  headSha?: string,
): Promise<PendingChanges> {
  const sha = headSha ?? (await ctx.write.refSha(branch));
  const { writes, deletions } = await loadDraftState(projectId, branch);
  const changes = await classifyChanges(ctx, sha, writes, deletions);
  return { headSha: sha, changes, writes, deletions };
}
