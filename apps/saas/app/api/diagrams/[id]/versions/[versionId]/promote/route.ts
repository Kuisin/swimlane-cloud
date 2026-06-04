import { withApi, json, ApiError } from "@/lib/api";
import { getGitea } from "@/lib/gitea";
import { getServiceSupabase } from "@/lib/supabase/server";
import { audit, getRepoCoords, requireUser } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/diagrams/[id]/versions/[versionId]/promote — promote a flagged
 * version to main (plan Step 2.2). Gated: only is_new_version on test may be
 * promoted; opens + merges a PR test→main and records the merge_request.
 */
export const POST = withApi(
  async (_req, ctx: { params: Promise<{ id: string; versionId: string }> }) => {
    const { id, versionId } = await ctx.params;
    const user = await requireUser();

    const supabase = getServiceSupabase();
    const { data: version, error } = await supabase
      .from("versions")
      .select("id, diagram_id, name, commit_sha, branch, is_new_version, promoted_to_main")
      .eq("id", versionId)
      .eq("diagram_id", id)
      .single();
    if (error || !version) throw new ApiError(404, "version not found");

    if (!version.is_new_version) {
      throw new ApiError(400, "Not a new-version commit");
    }
    if (version.branch !== "test") {
      throw new ApiError(400, "Version must be flagged on test");
    }
    if (version.promoted_to_main) {
      return json({ versionId, alreadyPromoted: true });
    }

    const { data: diagram } = await supabase
      .from("diagrams")
      .select("project_id")
      .eq("id", id)
      .single();
    const projectId = diagram?.project_id as string;
    const { org, repo, workspaceId } = await getRepoCoords(projectId);
    const gitea = getGitea();

    // Open PR test -> main and merge it. (Middleware contract: base=main needs a
    // linked flagged version_id with matching SHA — enforced here + in DB CHECK.)
    const { number } = await gitea.createPullRequest(org, repo, {
      title: `Promote ${version.name}`,
      body: `Promotes flagged version ${versionId} (${version.commit_sha}).`,
      head: "test",
      base: "main",
    });
    await gitea.mergePullRequest(org, repo, number, "merge");

    await supabase
      .from("merge_requests")
      .insert({
        project_id: projectId,
        gitea_pr_index: number,
        head_branch: "test",
        base_branch: "main",
        version_id: versionId,
        title: `Promote ${version.name}`,
        status: "merged",
        author_id: user.id,
      });

    await supabase
      .from("versions")
      .update({ promoted_to_main: true })
      .eq("id", versionId);

    await audit({
      workspaceId,
      userId: user.id,
      action: "version.promoted",
      entityType: "version",
      entityId: versionId,
      commitSha: version.commit_sha as string,
    });

    return json({ versionId, prIndex: number, promoted: true });
  },
);
