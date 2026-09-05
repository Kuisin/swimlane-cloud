import { GitHubConflictError, PROD_BRANCH } from "@swimlane-cloud/github-client";
import { withApi, json, ApiError } from "@/lib/api";
import { audit, requireProjectRole, type ProjectCtx } from "@/lib/projects";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Point a branch at a specific commit (the write API's ensureBranch takes a ref, not a sha). */
async function ensureBranchAtSha(ctx: ProjectCtx, name: string, sha: string): Promise<void> {
  try {
    await ctx.write.refSha(name);
    return;
  } catch {
    /* does not exist yet */
  }
  try {
    await ctx.rest.request(`/repos/${ctx.repo.owner}/${ctx.repo.repo}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${name}`, sha },
    });
  } catch (err) {
    if (!(err instanceof GitHubConflictError)) throw err;
  }
}

/**
 * POST /api/projects/[projectId]/versions/[versionId]/promote — land exactly
 * the flagged commit on main: a short-lived `release-*` branch at that sha,
 * a pull request into main, merge, branch gone. Only flagged versions can
 * reach main; `test` itself never merges directly.
 */
export const POST = withApi(
  async (_req, ctx: { params: Promise<{ projectId: string; versionId: string }> }) => {
    const { projectId, versionId } = await ctx.params;
    const project = await requireProjectRole(projectId, "owner");

    const supabase = getServiceSupabase();
    const { data: version } = await supabase
      .from("versions")
      .select("id, name, note, commit_sha, promoted_to_main, promoted_sha")
      .eq("id", versionId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!version) throw new ApiError(404, "Version not found");
    if (version.promoted_to_main) {
      return json({
        versionId,
        prNumber: null,
        promotedSha: version.promoted_sha,
        alreadyPromoted: true,
      });
    }

    const sha = version.commit_sha as string;
    const release = `release-${versionId.slice(0, 8)}`;
    await ensureBranchAtSha(project, release, sha);

    let prNumber: number | null = null;
    let promotedSha: string;
    try {
      const pr = await project.pulls.createPullRequest({
        head: release,
        base: PROD_BRANCH,
        title: `Promote ${version.name}`,
        body: (version.note as string | null) ?? `Version ${version.name} (${sha.slice(0, 7)})`,
      });
      prNumber = pr.number;
      const merged = await project.pulls.mergePullRequest(pr.number, {
        method: "merge",
        title: `Promote ${version.name} to ${PROD_BRANCH}`,
      });
      promotedSha = merged.sha;
    } catch (err) {
      // GitHub refuses a PR with nothing to merge: main already contains it.
      if (err instanceof GitHubConflictError && /No commits between/i.test(err.message)) {
        promotedSha = sha;
      } else {
        await project.repos.deleteBranch(project.repo.owner, project.repo.repo, release);
        throw err;
      }
    }
    await project.repos.deleteBranch(project.repo.owner, project.repo.repo, release);

    await supabase
      .from("versions")
      .update({ promoted_to_main: true, promoted_sha: promotedSha })
      .eq("id", versionId);
    if (prNumber !== null) {
      await supabase.from("merge_requests").upsert(
        {
          project_id: projectId,
          pr_number: prNumber,
          head_branch: release,
          base_branch: PROD_BRANCH,
          version_id: versionId,
          title: `Promote ${version.name}`,
          status: "merged",
          author_id: project.user.id,
          author_login: project.login,
          merged_by_login: project.login,
          closed_at: new Date().toISOString(),
        },
        { onConflict: "project_id,pr_number" },
      );
    }
    await audit({
      workspaceId: project.project.workspaceId,
      projectId,
      userId: project.user.id,
      actorLogin: project.login,
      action: "version.promoted",
      entityType: "version",
      entityId: versionId,
      commitSha: promotedSha,
    });
    return json({ versionId, prNumber, promotedSha });
  },
);
