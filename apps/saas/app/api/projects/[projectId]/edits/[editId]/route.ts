import { withApi, json, ApiError } from "@/lib/api";
import { audit, lockedBranches, requireProjectRole } from "@/lib/projects";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DELETE /api/projects/[projectId]/edits/[editId] — abandon an edit: delete
 * the tmp-* branch and its drafts. The author or an owner may do this; a
 * branch with an open pull request must be closed on the PR first.
 */
export const DELETE = withApi(
  async (_req, ctx: { params: Promise<{ projectId: string; editId: string }> }) => {
    const { projectId, editId } = await ctx.params;
    const project = await requireProjectRole(projectId, "editor");

    const supabase = getServiceSupabase();
    const { data: session } = await supabase
      .from("edit_sessions")
      .select("id, branch_name, status, created_by_login")
      .eq("id", editId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!session) throw new ApiError(404, "Edit session not found");
    if (session.status !== "active") return json({ abandoned: false, status: session.status });
    if (project.role !== "owner" && session.created_by_login !== project.login) {
      throw new ApiError(403, "Only the author or a repository admin can abandon this edit.");
    }
    const branch = session.branch_name as string;
    if ((await lockedBranches(project)).has(branch)) {
      throw new ApiError(409, "Close the open pull request before abandoning this edit.", {
        locked: true,
      });
    }

    await project.repos.deleteBranch(project.repo.owner, project.repo.repo, branch);
    await supabase.from("drafts").delete().eq("project_id", projectId).eq("branch", branch);
    await supabase
      .from("edit_sessions")
      .update({ status: "abandoned", closed_at: new Date().toISOString() })
      .eq("id", editId);

    await audit({
      workspaceId: project.project.workspaceId,
      projectId,
      userId: project.user.id,
      actorLogin: project.login,
      action: "edit.abandoned",
      entityType: "branch",
      entityId: branch,
    });
    return json({ abandoned: true, branch });
  },
);
