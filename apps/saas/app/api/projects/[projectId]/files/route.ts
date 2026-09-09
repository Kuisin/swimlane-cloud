import { isEditBranch } from "@swimlane-cloud/github-client";
import { withApi, json, readJson, ApiError } from "@/lib/api";
import { assertRef, assertRepoPath } from "@/lib/guard";
import { moveFileId } from "@/lib/file-ids";
import {
  assertBranchWritable,
  loadProjectTemplates,
  lockedBranches,
  requireProjectRole,
} from "@/lib/projects";
import {
  isDraftablePath,
  listDiagramFiles,
  loadDraftState,
  readTextAt,
  resolveSha,
  withinDiagramsRoot,
} from "@/lib/repo-files";
import { dslOf, isMarkdownFile, storedFrom } from "@/lib/diagram-file";
import { getServiceSupabase } from "@/lib/supabase/server";
import { assertForcedSectionsForFile } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body =
  | { op: "delete"; branch: string; path: string }
  | { op: "rmdir"; branch: string; dir: string }
  | { op: "rename"; branch: string; from: string; to: string };

/**
 * POST /api/projects/[projectId]/files — delete a file, remove a folder, or
 * move a file, all as *pending* operations on the branch.
 *
 * Nothing here touches git: an edit only reaches a commit at checkpoint, and a
 * deletion behaves the same way, recorded as a `drafts` row with
 * `deleted = true`. That keeps a delete undoable until the author commits, and
 * lets a rename land as one commit that adds the new path and drops the old.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const body = await readJson<Body>(req);
  if (!body.branch) throw new ApiError(400, "branch is required");
  assertRef(body.branch);

  const project = await requireProjectRole(projectId, "editor");
  assertBranchWritable(body.branch, project.role, await lockedBranches(project));

  const supabase = getServiceSupabase();
  const [state, listing] = await Promise.all([
    loadDraftState(projectId, body.branch),
    resolveSha(project, body.branch).then((sha) => listDiagramFiles(project, sha)),
  ]);
  const committed = new Set(listing.files);
  const config = listing.config;
  const now = new Date().toISOString();
  const actor = { updated_by: project.user.id, updated_by_login: project.login, updated_at: now };

  /**
   * Committed content needs a tombstone so the next checkpoint removes it from
   * git; a file created here and never checkpointed can just disappear.
   */
  async function markDeleted(paths: string[]): Promise<{ removed: number }> {
    const tombstone = paths.filter((p) => committed.has(p));
    const dropDraft = paths.filter((p) => !committed.has(p));

    if (dropDraft.length) {
      await supabase
        .from("drafts")
        .delete()
        .eq("project_id", projectId)
        .eq("branch", body.branch)
        .in("filepath", dropDraft);
    }
    if (tombstone.length) {
      const { error } = await supabase.from("drafts").upsert(
        tombstone.map((p) => ({
          project_id: projectId,
          filepath: p,
          branch: body.branch,
          dsl_text: "",
          deleted: true,
          ...actor,
        })),
        { onConflict: "project_id,filepath,branch" },
      );
      if (error) throw new ApiError(500, `delete failed: ${error.message}`);
    }
    return { removed: paths.length };
  }

  if (body.op === "delete") {
    assertRepoPath(body.path);
    if (!isDraftablePath(body.path)) throw new ApiError(400, `${body.path} is not a diagram path.`);
    if (!committed.has(body.path) && !(body.path in state.writes)) {
      throw new ApiError(404, `${body.path} does not exist on ${body.branch}.`);
    }
    return json(await markDeleted([body.path]));
  }

  if (body.op === "rmdir") {
    const dir = assertRepoPath(body.dir).replace(/\/+$/, "");
    const prefix = `${dir}/`;
    const targets = [...new Set([...committed, ...Object.keys(state.writes)])].filter(
      (p) => p.startsWith(prefix) && isDraftablePath(p),
    );
    if (targets.length === 0) throw new ApiError(404, `${dir} has no files to remove.`);
    return json(await markDeleted(targets));
  }

  if (body.op === "rename") {
    assertRepoPath(body.from);
    // Same rule as a draft write: a destination outside the diagram root would
    // be moved out of the very tree the editor lists, and vanish.
    const to = withinDiagramsRoot(assertRepoPath(body.to), config);
    if (!isDraftablePath(body.from) || !isDraftablePath(to)) {
      throw new ApiError(400, "Only diagram paths can be moved.");
    }
    if (body.from === to) return json({ renamed: false, from: body.from, to });
    if (committed.has(to) || to in state.writes) {
      throw new ApiError(409, `${to} already exists on ${body.branch}.`);
    }

    const text =
      state.writes[body.from] ??
      (committed.has(body.from) ? await readTextAt(project, body.from, body.branch) : null);
    if (text === null || text === undefined) {
      throw new ApiError(404, `${body.from} does not exist on ${body.branch}.`);
    }
    // Renaming across the two diagram formats converts the file: a `.txt`
    // holds raw DSL and a `.md` holds it in a fence, so moving between them
    // without rewriting the content would leave the destination unreadable —
    // and, since a `.md` holding raw DSL parses as prose, would also slip past
    // the forced-section check below.
    const sourceDsl = dslOf(body.from, text);
    const stored =
      sourceDsl === null || isMarkdownFile(body.from) === isMarkdownFile(to)
        ? text
        : storedFrom(to, sourceDsl);

    {
      const { policies, templatesById } = await loadProjectTemplates(projectId);
      if (Object.values(policies).some((p) => p.mode === "forced")) {
        assertForcedSectionsForFile(to, stored, policies, templatesById);
      }
    }

    const { error } = await supabase.from("drafts").upsert(
      {
        project_id: projectId,
        filepath: to,
        branch: body.branch,
        dsl_text: stored,
        deleted: false,
        ...actor,
      },
      { onConflict: "project_id,filepath,branch" },
    );
    if (error) throw new ApiError(500, `rename failed: ${error.message}`);
    await markDeleted([body.from]);
    // A file's identity follows a rename only once the rename is visible to
    // everyone. On an edit branch that is when its pull request is approved
    // (the merge route moves it then); repointing it here, for a private and
    // possibly-abandoned edit, would make the id resolve to a path no other
    // branch has yet — see the comment on moveFileId. Kept for the legacy
    // case of a branch that is neither, which the guard above already rejects.
    if (!isEditBranch(body.branch)) await moveFileId(projectId, body.from, to);
    return json({ renamed: true, from: body.from, to });
  }

  throw new ApiError(400, "op must be delete, rmdir or rename");
});
