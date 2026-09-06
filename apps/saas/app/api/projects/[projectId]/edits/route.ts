import { INTEGRATION_BRANCH, editBranchName } from "@swimlane-cloud/github-client";
import { withApi, json, readJson, ApiError } from "@/lib/api";
import { assertRef } from "@/lib/guard";
import { audit, lockedBranches, requireProjectRole } from "@/lib/projects";
import { isRepoNotAccessible } from "@/lib/repo-errors";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/projects/[projectId]/edits — cut a new edit branch
 * (`<login>/<timestamp>/<key>`) from preview and record the edit session.
 *
 * `editName` is accepted for backward compatibility with the hub and VS Code
 * clients but no longer shapes the branch name; the SaaS UI sends no body.
 * If the caller already has an active, unlocked edit session, it is reused
 * instead of piling up a new branch on every double-click of "Start editing".
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  await readJson<{ editName?: string }>(req).catch(() => ({}));

  const project = await requireProjectRole(projectId, "editor");
  const supabase = getServiceSupabase();

  const { data: activeSessions } = await supabase
    .from("edit_sessions")
    .select("id, branch_name")
    .eq("project_id", projectId)
    .eq("created_by_login", project.login)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (activeSessions && activeSessions.length > 0) {
    const locked = await lockedBranches(project);
    for (const session of activeSessions) {
      const branch = session.branch_name as string;
      if (locked.has(branch)) continue;
      try {
        const sha = await project.write.refSha(branch);
        return json({ editId: session.id, branch, sha, reused: true });
      } catch (err) {
        if (!isRepoNotAccessible(err)) throw err;
        // The branch was deleted outside the app (merged, or removed on
        // GitHub directly); fall through and try the next session, or create
        // a fresh one below.
      }
    }
  }

  const branch = editBranchName(project.login);
  assertRef(branch);

  const baseSha = await project.write.refSha(INTEGRATION_BRANCH);
  await project.write.ensureBranch(branch, INTEGRATION_BRANCH);
  const sha = await project.write.refSha(branch);

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
