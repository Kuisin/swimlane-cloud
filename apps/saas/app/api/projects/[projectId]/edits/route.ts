import { withApi, json, readJson, ApiError } from "@/lib/api";
import { getGitea } from "@/lib/gitea";
import { getServiceSupabase } from "@/lib/supabase/server";
import { audit, getRepoCoords, requireUser } from "@/lib/projects";
import { INTEGRATION_BRANCH, tmpBranchName } from "@swimlane-cloud/github-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface StartEditBody {
  editName: string;
  userSlug?: string;
}

/**
 * POST /api/projects/[projectId]/edits — start an edit on a tmp-* branch
 * (plan Step 3.1). Always branches from `test`. Phase 3 start (basic).
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const user = await requireUser();
  const body = await readJson<StartEditBody>(req);
  if (!body.editName) throw new ApiError(400, "editName is required");

  // Shared with the hub and the VS Code extension so the same edit produces
  // the same branch name everywhere.
  const branchName = tmpBranchName(body.userSlug ?? user.email ?? user.id, body.editName);

  const { org, repo, workspaceId } = await getRepoCoords(projectId);
  const gitea = getGitea();
  await gitea.createBranch(org, repo, branchName, INTEGRATION_BRANCH);

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("edit_sessions")
    .insert({
      project_id: projectId,
      branch_name: branchName,
      created_by: user.id,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw new ApiError(400, error.message);

  await audit({
    workspaceId,
    userId: user.id,
    action: "edit.started",
    entityType: "edit_session",
    entityId: data.id as string,
  });

  return json({ editId: data.id, branch: branchName }, 201);
});

/** GET — list edit sessions for a project. */
export const GET = withApi(async (_req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("edit_sessions")
    .select("id, branch_name, status, created_at, created_by")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(500, error.message);
  return json({ edits: data ?? [] });
});
