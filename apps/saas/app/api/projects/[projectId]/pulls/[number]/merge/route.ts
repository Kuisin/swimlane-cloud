import { isEditBranch, isIntegrationBranch } from "@swimlane-cloud/github-client";
import { withApi, json, readJson, ApiError } from "@/lib/api";
import { moveFileId } from "@/lib/file-ids";
import { parsePullNumber } from "@/lib/guard";
import { audit, requireProjectRole } from "@/lib/projects";
import { isDraftablePath } from "@/lib/repo-files";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST {expectedHeadSha?} — merge an edit branch → preview pull request (owner
 * only), then delete the edit branch and close its session. Anything
 * targeting main is refused here: promotion has its own gated route.
 */
export const POST = withApi(
  async (req, ctx: { params: Promise<{ projectId: string; number: string }> }) => {
    const { projectId, number } = await ctx.params;
    const n = parsePullNumber(number);
    const body = await readJson<{ expectedHeadSha?: string }>(req).catch(
      () => ({}) as { expectedHeadSha?: string },
    );
    const project = await requireProjectRole(projectId, "owner");
    if (project.project.provider !== "github") {
      throw new ApiError(
        400,
        "Pull request review is only available for GitHub-backed projects in this release.",
      );
    }

    const pull = await project.pulls.getPullRequest(n);
    if (!isIntegrationBranch(pull.base)) {
      throw new ApiError(
        400,
        "Only pull requests into preview are merged here. Promote versions from the Versions tab.",
      );
    }
    if (pull.state !== "open") throw new ApiError(409, "This pull request is not open.");

    // Renames in this request become real for everyone once it is merged, so
    // this is where a moved file's stable id follows it (a rename on the edit
    // branch itself deliberately leaves `file_identities` alone — see
    // moveFileId). Collected before the merge, while the head still exists.
    let renames: { from: string; to: string }[] = [];
    try {
      const cmp = await project.commits.compare(pull.base, pull.head);
      renames = cmp.files
        .filter((f) => f.status === "renamed" && f.previousPath && isDraftablePath(f.path))
        .map((f) => ({ from: f.previousPath as string, to: f.path }));
    } catch (err) {
      console.warn(`[merge] could not read renames for #${n}`, err);
    }

    const result = await project.pulls.mergePullRequest(n, {
      method: "merge",
      ...(body.expectedHeadSha ? { expectedHeadSha: body.expectedHeadSha } : {}),
    });

    for (const r of renames) {
      try {
        await moveFileId(projectId, r.from, r.to);
      } catch (err) {
        // Best-effort: a stale id resolves to a path that then 404s on the
        // branch, which is the visible failure, not a wrong file opening.
        console.warn(`[merge] could not move file id ${r.from} -> ${r.to}`, err);
      }
    }

    const supabase = getServiceSupabase();
    let deletedBranch: string | null = null;
    if (isEditBranch(pull.head)) {
      await project.repos.deleteBranch(pull.head);
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
