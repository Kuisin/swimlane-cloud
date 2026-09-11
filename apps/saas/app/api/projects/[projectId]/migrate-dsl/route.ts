import { isIntegrationBranch, INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { migrateLegacyDsl } from "@swimlane-cloud/diagram-converter";
import { withApi, json, readJson, ApiError } from "@/lib/api";
import { dslOf, storedFrom } from "@/lib/diagram-file";
import { assertRef } from "@/lib/guard";
import { assertBranchWritable, audit, lockedBranches, requireProjectRole } from "@/lib/projects";
import {
  hasPendingDrafts,
  listDiagramFiles,
  mapLimit,
  readTextAt,
  resolveSha,
} from "@/lib/repo-files";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface MigrateBody {
  branch: string;
  /**
   * Carry the same migration to every open edit branch. Defaults to true when
   * `branch` is the integration branch, and is ignored otherwise.
   */
  editBranches?: boolean;
}

/** The same ceiling `snapshotAt` uses: a bulk action should 413, not time out. */
const MIGRATE_LIMIT = 300;

const COMMIT_MESSAGE = (n: number) =>
  `Update DSL to the current grammar (${n} file${n === 1 ? "" : "s"})\n\nThe header; if (q) + case (a) fused into if (q) is (a) than, a later\ncase (b) into else-if (b) than, a bare else into else-if () than, and a\nfork's and (b) into case (b); [loop] into loop; merge: id; and\n[merge: id] into [goto: id]; a step's props:/arrow:/link: lines into\nsuffixes, and its retired @id suffix into the id: line — the constructs\nthe earlier grammar used that this reader no longer accepts. A jump with\nno target is left for a hand edit.`;

interface BranchResult {
  branch: string;
  updated: number;
  lines: number;
  commitSha: string | null;
  /** Why nothing was written, when `updated` is 0 and it was not simply current. */
  skipped?: "pendingDrafts" | "tooMany" | "failed";
  error?: string;
}

/** Rewrite every diagram on one branch, in a single commit. */
async function migrateBranch(
  project: Awaited<ReturnType<typeof requireProjectRole>>,
  projectId: string,
  branch: string,
): Promise<BranchResult> {
  const empty: BranchResult = { branch, updated: 0, lines: 0, commitSha: null };

  if (await hasPendingDrafts(projectId, branch)) {
    return { ...empty, skipped: "pendingDrafts" };
  }

  const sha = await resolveSha(project, branch);
  const { files } = await listDiagramFiles(project, sha);
  if (files.length > MIGRATE_LIMIT) return { ...empty, skipped: "tooMany" };

  const texts = await mapLimit(files, 8, (p) => readTextAt(project, p, sha));
  const writes: { path: string; text: string }[] = [];
  let lines = 0;
  files.forEach((p, i) => {
    const stored = texts[i];
    if (typeof stored !== "string") return;
    const dsl = dslOf(p, stored);
    if (dsl === null) return;
    const { text, changed } = migrateLegacyDsl(dsl);
    if (!changed) return;
    lines += changed;
    writes.push({ path: p, text: storedFrom(p, text, stored) });
  });
  if (writes.length === 0) return empty;

  const result = await project.write.commitFiles({
    branch,
    message: COMMIT_MESSAGE(writes.length),
    files: writes,
    deletions: [],
    expectedHeadSha: sha,
    author: { name: project.login, email: project.commitAuthorEmail },
  });
  return { branch, updated: writes.length, lines, commitSha: result.sha };
}

/** Every edit branch with an open session, oldest first. */
async function openEditBranches(projectId: string, exclude: string): Promise<string[]> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("edit_sessions")
    .select("branch_name")
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  const seen = new Set<string>([exclude]);
  const branches: string[] = [];
  for (const row of data ?? []) {
    const name = (row as { branch_name: string }).branch_name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    branches.push(name);
  }
  return branches;
}

/**
 * POST /api/projects/[projectId]/migrate-dsl — rewrite every diagram on a
 * branch from the earlier grammar into the current one (the header; a bare
 * `if (q)` and the `case (a)` line under it fused into `if (q) is (a) than`,
 * a later `case (b)` into `else-if (b) than`, a bare `else` into
 * `else-if () than` and a fork's `and (b)` into `case (b)`; `[loop]` into
 * `loop`; `merge: id;` and `[merge: id]` into `[goto: id]`; and a step's
 * `props:`/`arrow:`/`link:` lines and retired `@id` suffix into suffixes and
 * the `id:` line), in **one commit**, so a repository written before the
 * change opens again.
 *
 * `migrateLegacyDsl` owns every rewrite rule, so this route needs no grammar
 * knowledge of its own: it reads, calls, and commits. A jump with no target —
 * a bare `merge;` / `[merge]`, or a `[merge]` / `[merge: name]` landing marker
 * — has no automatic mapping (there is no marker concept any more), so the
 * migration leaves those lines alone and the reader reports them.
 *
 * **Open edit branches are migrated too**, when the target is the integration
 * branch. A migration that lands on `preview` alone leaves every open draft on
 * the old spelling, and because the rewrite touches the same lines the draft is
 * editing, every one of those drafts is then guaranteed to conflict on merge —
 * not over content, but over how the same content is written. Carrying the
 * migration across at the moment it lands is what stops that, and it is safe to
 * do unasked because the rewrite is mechanical and idempotent. A draft with
 * unpushed changes is reported rather than rewritten, for the same reason the
 * primary branch refuses one: the next push would bring the old grammar back.
 *
 * Same shape as convert-markdown: lands as a single reviewable, revertable
 * commit per branch.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const body = await readJson<MigrateBody>(req);
  if (!body.branch) throw new ApiError(400, "branch is required");
  assertRef(body.branch);

  const project = await requireProjectRole(projectId, "editor");
  const locked = await lockedBranches(project);
  assertBranchWritable(body.branch, project.role, locked);

  if (await hasPendingDrafts(projectId, body.branch)) {
    throw new ApiError(
      409,
      "Push or discard your pending changes before updating the DSL — an unpushed edit would bring the old grammar back.",
    );
  }

  const primary = await migrateBranch(project, projectId, body.branch);
  if (primary.skipped === "tooMany") {
    throw new ApiError(413, `Too many diagrams to update at once on ${body.branch}.`);
  }

  if (primary.commitSha) {
    await audit({
      workspaceId: project.project.workspaceId,
      projectId,
      userId: project.user.id,
      actorLogin: project.login,
      action: "migrate-dsl",
      entityType: "branch",
      entityId: body.branch,
      commitSha: primary.commitSha,
    });
  }

  const fanOut = isIntegrationBranch(body.branch) && body.editBranches !== false;
  const editBranches: BranchResult[] = [];
  if (fanOut) {
    for (const branch of await openEditBranches(projectId, body.branch)) {
      // One draft failing — locked, deleted behind our back, its own conflict —
      // must not lose the others or undo the commit already on preview.
      try {
        assertBranchWritable(branch, project.role, locked);
        const res = await migrateBranch(project, projectId, branch);
        editBranches.push(res);
        if (res.commitSha) {
          await audit({
            workspaceId: project.project.workspaceId,
            projectId,
            userId: project.user.id,
            actorLogin: project.login,
            action: "migrate-dsl",
            entityType: "branch",
            entityId: branch,
            commitSha: res.commitSha,
          });
        }
      } catch (err) {
        console.warn(`[migrate-dsl] could not update ${branch}`, err);
        editBranches.push({
          branch,
          updated: 0,
          lines: 0,
          commitSha: null,
          skipped: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return json({
    updated: primary.updated,
    lines: primary.lines,
    commitSha: primary.commitSha,
    branch: body.branch,
    /** Present only when the target was `preview`; see the route docstring. */
    editBranches: fanOut ? editBranches : undefined,
    integrationBranch: INTEGRATION_BRANCH,
  });
});
