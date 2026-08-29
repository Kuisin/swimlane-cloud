import { withApi, json, readJson, ApiError } from "@/lib/api";
import { getGitea } from "@/lib/gitea";
import { getServiceSupabase } from "@/lib/supabase/server";
import { audit, getRepoCoords, requireUser } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface MergeRequestBody {
  title?: string;
  body?: string;
  merge?: boolean; // optionally auto-merge to test
}

/**
 * POST /api/projects/[projectId]/edits/[editId]/merge-request — open a PR
 * tmp-* -> test (plan Step 3.2). Never targets main directly. Phase 3 start.
 */
export const POST = withApi(
  async (req, ctx: { params: Promise<{ projectId: string; editId: string }> }) => {
    const { projectId, editId } = await ctx.params;
    const user = await requireUser();
    const input = await readJson<MergeRequestBody>(req);

    const supabase = getServiceSupabase();
    const { data: edit, error } = await supabase
      .from("edit_sessions")
      .select("id, branch_name, status")
      .eq("id", editId)
      .eq("project_id", projectId)
      .single();
    if (error || !edit) throw new ApiError(404, "edit session not found");

    const { org, repo, workspaceId } = await getRepoCoords(projectId);
    const gitea = getGitea();

    const title = input.title ?? `Merge ${edit.branch_name} into test`;
    const { number } = await gitea.createPullRequest(org, repo, {
      title,
      body: input.body ?? "",
      head: edit.branch_name as string,
      base: "test",
    });

    let status: "open" | "merged" = "open";
    if (input.merge) {
      await gitea.mergePullRequest(org, repo, number, "merge");
      status = "merged";
      await supabase.from("edit_sessions").update({ status: "merged" }).eq("id", editId);
    }

    await supabase.from("merge_requests").insert({
      project_id: projectId,
      gitea_pr_index: number,
      head_branch: edit.branch_name,
      base_branch: "test",
      title,
      status,
      author_id: user.id,
    });

    await audit({
      workspaceId,
      userId: user.id,
      action: "merge_request.opened",
      entityType: "merge_request",
      entityId: String(number),
    });

    return json({ prIndex: number, status }, 201);
  },
);
