import { withApi, json, readJson, ApiError } from "@/lib/api";
import { assertRef, assertRepoPath } from "@/lib/guard";
import {
  assertBranchWritable,
  loadProjectTemplates,
  lockedBranches,
  requireProjectRole,
} from "@/lib/projects";
import { isDraftablePath, readConfigAt, withinDiagramsRoot } from "@/lib/repo-files";
import { getServiceSupabase } from "@/lib/supabase/server";
import { assertForcedSections } from "@/lib/templates";

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
    if (!isDraftablePath(f.id)) throw new ApiError(400, `${f.id} is not a diagram path.`);
    if (typeof f.dsl !== "string") throw new ApiError(400, `${f.id}: dsl must be a string`);
  }

  const project = await requireProjectRole(projectId, "editor");
  assertBranchWritable(body.branch, project.role, await lockedBranches(project));

  const { policies, templatesById } = await loadProjectTemplates(projectId);
  if (Object.values(policies).some((p) => p.mode === "forced")) {
    for (const f of body.files) {
      if (f.id.endsWith(".txt")) assertForcedSections(f.dsl, policies, templatesById);
    }
  }

  // A path the editor suggested without a folder selected would otherwise be
  // written outside the diagram tree and vanish from the listing.
  const config = await readConfigAt(project, body.branch);
  const files = body.files.map((f) => ({ ...f, id: withinDiagramsRoot(f.id, config) }));

  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase.from("drafts").upsert(
    files.map((f) => ({
      project_id: projectId,
      filepath: f.id,
      branch: body.branch,
      dsl_text: f.dsl,
      updated_by: project.user.id,
      updated_by_login: project.login,
      updated_at: now,
    })),
    { onConflict: "project_id,filepath,branch" },
  );
  if (error) throw new ApiError(500, `draft upsert failed: ${error.message}`);
  return json({ saved: files.length, paths: files.map((f) => f.id) });
});

/** DELETE /api/projects/[projectId]/draft?branch=[&path=] — discard drafts. */
export const DELETE = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const branch = url.searchParams.get("branch");
  const path = url.searchParams.get("path");
  if (!branch) throw new ApiError(400, "branch is required");
  assertRef(branch);

  const project = await requireProjectRole(projectId, "editor");
  assertBranchWritable(branch, project.role, await lockedBranches(project));

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
