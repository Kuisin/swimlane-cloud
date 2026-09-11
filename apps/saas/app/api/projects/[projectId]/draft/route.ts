import { isIntegrationBranch } from "@swimlane-cloud/github-client";
import { withApi, json, readJson, ApiError } from "@/lib/api";
import { listPendingChanges } from "@/lib/changes";
import { assertRef, assertRepoPath } from "@/lib/guard";
import {
  assertBranchWritable,
  loadProjectTemplates,
  lockedBranches,
  requireProjectRole,
} from "@/lib/projects";
import {
  isDraftablePath,
  isSettingsPath,
  readConfigAt,
  withinDiagramsRoot,
} from "@/lib/repo-files";
import { getServiceSupabase } from "@/lib/supabase/server";
import { assertForcedSectionsForFile } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DraftBody {
  branch: string;
  files: { id: string; dsl: string }[];
}

/**
 * POST /api/projects/[projectId]/draft — save working copies. No GitHub
 * write; drafts become a commit at checkpoint. Forced sections are validated
 * here too so an author learns about a template violation on Save, not later.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const body = await readJson<DraftBody>(req);
  if (!body.branch) throw new ApiError(400, "branch is required");
  if (!Array.isArray(body.files) || body.files.length === 0) {
    throw new ApiError(400, "files[] is required");
  }
  assertRef(body.branch);
  for (const f of body.files) {
    assertRepoPath(f.id);
    if (!isDraftablePath(f.id) && !isSettingsPath(f.id)) {
      throw new ApiError(400, `${f.id} is not a diagram path.`);
    }
    if (typeof f.dsl !== "string") throw new ApiError(400, `${f.id}: dsl must be a string`);
  }

  const project = await requireProjectRole(projectId, "editor");
  assertBranchWritable(body.branch, project.role, await lockedBranches(project));

  const { policies, templatesById } = await loadProjectTemplates(projectId);
  if (Object.values(policies).some((p) => p.mode === "forced")) {
    for (const f of body.files) {
      assertForcedSectionsForFile(f.id, f.dsl, policies, templatesById);
    }
  }

  // A path the editor suggested without a folder selected would otherwise be
  // written outside the diagram tree and vanish from the listing.
  const config = await readConfigAt(project, body.branch);
  // The settings file is exempt from re-rooting: every reader resolves it at
  // the repository root, so moving it under `diagramsRoot` would commit it
  // where nothing looks for it.
  const files = body.files.map((f) =>
    isSettingsPath(f.id) ? f : { ...f, id: withinDiagramsRoot(f.id, config) },
  );

  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase.from("drafts").upsert(
    files.map((f) => ({
      project_id: projectId,
      filepath: f.id,
      branch: body.branch,
      dsl_text: f.dsl,
      // A write always revives the path. Without this a file deleted and then
      // re-created (or renamed away and back) kept its tombstone: the text was
      // stored, but the tree hid it and reads answered with the deletion.
      deleted: false,
      updated_by: project.user.id,
      updated_by_login: project.login,
      updated_at: now,
    })),
    { onConflict: "project_id,filepath,branch" },
  );
  if (error) throw new ApiError(500, `draft upsert failed: ${error.message}`);
  return json({ saved: files.length, paths: files.map((f) => f.id), updatedAt: now });
});

/**
 * GET /api/projects/[projectId]/draft?branch= — every uncommitted change on
 * the branch, classified added/changed/removed. Backs the Push and
 * Request-review modals' file lists.
 */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const branch = new URL(req.url).searchParams.get("branch");
  if (!branch) throw new ApiError(400, "branch is required");
  assertRef(branch);

  const project = await requireProjectRole(projectId, "viewer");
  const { headSha, changes } = await listPendingChanges(project, projectId, branch);
  return json({ headSha, changes });
});

/**
 * DELETE /api/projects/[projectId]/draft?branch=[&path=] — discard drafts.
 *
 * Discarding is allowed in one place editing is not: `preview`, for owners.
 * Drafts saved there before preview became review-only would otherwise be
 * stranded — nothing can push them and they keep the branch marked dirty,
 * which blocks publishing a version.
 */
export const DELETE = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const branch = url.searchParams.get("branch");
  const path = url.searchParams.get("path");
  if (!branch) throw new ApiError(400, "branch is required");
  assertRef(branch);

  const project = await requireProjectRole(projectId, "editor");
  if (isIntegrationBranch(branch)) {
    if (project.role !== "owner") {
      throw new ApiError(403, "Only a repository admin can discard drafts left on preview.", {
        lockReason: "preview",
      });
    }
  } else {
    assertBranchWritable(branch, project.role, await lockedBranches(project));
  }

  const supabase = getServiceSupabase();
  let q = supabase
    .from("drafts")
    .delete({ count: "exact" })
    .eq("project_id", projectId)
    .eq("branch", branch);
  if (path) q = q.eq("filepath", assertRepoPath(path));
  const { error, count } = await q;
  if (error) throw new ApiError(500, `draft delete failed: ${error.message}`);
  return json({ deleted: count ?? 0 });
});
