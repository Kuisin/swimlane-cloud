import { INTEGRATION_BRANCH, tmpBranchName } from "@swimlane-cloud/github-client";
import { withApi, json, readJson, ApiError } from "@/lib/api";
import { assertRef } from "@/lib/guard";
import { audit, requireProjectRole } from "@/lib/projects";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/projects/[projectId]/edits {editName} — cut a tmp-* branch from
 * test (or reuse it if it already exists) and record the edit session.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const body = await readJson<{ editName?: string }>(req);
  if (!body.editName?.trim()) throw new ApiError(400, "editName is required");

  const project = await requireProjectRole(projectId, "editor");
  const branch = tmpBranchName(project.login, body.editName);
  assertRef(branch);

  const baseSha = await project.write.refSha(INTEGRATION_BRANCH);
  await project.write.ensureBranch(branch, INTEGRATION_BRANCH);
  const sha = await project.write.refSha(branch);

  const supabase = getServiceSupabase();
  const { data: existing } = await supabase
    .from("edit_sessions")
    .select("id")
    .eq("project_id", projectId)
    .eq("branch_name", branch)
    .eq("status", "active")
    .maybeSingle();
  if (existing) return json({ editId: existing.id, branch, sha, reused: true });

  const { data, error } = await supabase
    .from("edit_sessions")
    .insert({
      project_id: projectId,
      branch_name: branch,
      base_sha: baseSha,
      created_by: project.user.id,
      created_by_login: project.login,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw new ApiError(400, error.message);

  await audit({
    workspaceId: project.project.workspaceId,
    projectId,
    userId: project.user.id,
    actorLogin: project.login,
    action: "edit.started",
    entityType: "branch",
    entityId: branch,
    commitSha: sha,
  });
  return json({ editId: data.id, branch, sha, reused: false }, 201);
});

/** GET — edit sessions for the project, newest first. */
export const GET = withApi(async (_req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  await requireProjectRole(projectId, "viewer");
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("edit_sessions")
    .select("id, branch_name, base_sha, status, created_at, created_by_login, closed_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(500, error.message);
  return json({ edits: data ?? [] });
});
