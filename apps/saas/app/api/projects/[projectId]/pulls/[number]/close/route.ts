import { withApi, json, ApiError } from "@/lib/api";
import { parsePullNumber } from "@/lib/guard";
import { audit, requireProjectRole } from "@/lib/projects";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST — close without merging. The author or an owner. The branch stays. */
export const POST = withApi(
  async (_req, ctx: { params: Promise<{ projectId: string; number: string }> }) => {
    const { projectId, number } = await ctx.params;
    const n = parsePullNumber(number);
    const project = await requireProjectRole(projectId, "editor");

    const pull = await project.pulls.getPullRequest(n);
    if (project.role !== "owner" && pull.author !== project.login) {
      throw new ApiError(403, "Only the author or a repository admin can close this pull request.");
    }
    if (pull.state !== "open") return json({ closed: false, state: pull.state });

    await project.pulls.closePullRequest(n);
    const supabase = getServiceSupabase();
    await supabase
      .from("merge_requests")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("pr_number", n);
    await audit({
      workspaceId: project.project.workspaceId,
      projectId,
      userId: project.user.id,
      actorLogin: project.login,
      action: "pull.closed",
      entityType: "pull",
      entityId: String(n),
    });
    return json({ closed: true });
  },
);
