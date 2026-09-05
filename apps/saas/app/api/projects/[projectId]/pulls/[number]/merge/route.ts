import { isIntegrationBranch, isTmpBranch } from "@swimlane-cloud/github-client";
import { withApi, json, readJson, ApiError } from "@/lib/api";
import { parsePullNumber } from "@/lib/guard";
import { audit, requireProjectRole } from "@/lib/projects";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST {expectedHeadSha?} — merge a tmp-* → test pull request (owner only),
 * then delete the edit branch and close its session. Anything targeting main
 * is refused here: promotion has its own gated route.
 */
export const POST = withApi(
  async (req, ctx: { params: Promise<{ projectId: string; number: string }> }) => {
    const { projectId, number } = await ctx.params;
    const n = parsePullNumber(number);
    const body = await readJson<{ expectedHeadSha?: string }>(req).catch(
      () => ({}) as { expectedHeadSha?: string },
    );
    const project = await requireProjectRole(projectId, "owner");

    const pull = await project.pulls.getPullRequest(n);
    if (!isIntegrationBranch(pull.base)) {
      throw new ApiError(
        400,
        "Only pull requests into test are merged here. Promote versions from the Versions tab.",
      );
    }
    if (pull.state !== "open") throw new ApiError(409, "This pull request is not open.");

    const result = await project.pulls.mergePullRequest(n, {
      method: "merge",
      ...(body.expectedHeadSha ? { expectedHeadSha: body.expectedHeadSha } : {}),
    });

    const supabase = getServiceSupabase();
    let deletedBranch: string | null = null;
    if (isTmpBranch(pull.head)) {
      await project.repos.deleteBranch(project.repo.owner, project.repo.repo, pull.head);
      deletedBranch = pull.head;
      await supabase.from("drafts").delete().eq("project_id", projectId).eq("branch", pull.head);
      await supabase
        .from("edit_sessions")
        .update({ status: "merged", closed_at: new Date().toISOString() })
        .eq("project_id", projectId)
        .eq("branch_name", pull.head)
        .eq("status", "active");
    }
    await supabase.from("merge_requests").upsert(
      {
        project_id: projectId,
        pr_number: n,
        head_branch: pull.head,
        base_branch: pull.base,
        title: pull.title,
        status: "merged",
        author_login: pull.author,
        merged_by_login: project.login,
        closed_at: new Date().toISOString(),
      },
      { onConflict: "project_id,pr_number" },
    );
    await audit({
      workspaceId: project.project.workspaceId,
      projectId,
      userId: project.user.id,
      actorLogin: project.login,
      action: "pull.merged",
      entityType: "pull",
      entityId: String(n),
      commitSha: result.sha,
    });
    return json({ sha: result.sha, merged: result.merged, deletedBranch });
  },
);
