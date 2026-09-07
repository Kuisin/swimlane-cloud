/**
 * The one way the app itself puts a commit on `preview`.
 *
 * `preview` is review-only: nothing commits to it directly, it only changes
 * when a pull request is merged (branch-model.ts). The app has a few writes
 * of its own that must nevertheless land there — the `templates/` mirror the
 * desktop app and VS Code extension read — and they go through the same door
 * as everyone else: a short-lived branch cut at preview's tip, one commit, a
 * pull request into preview, merged at once by the owner who made the change,
 * branch deleted. GitHub keeps the pull request as the record of who changed
 * what, exactly as it does for a person's edit.
 *
 * GitLab projects have no merge-request support yet (phase 1), so for them
 * this is a direct commit — the documented gap, not a second rule.
 */
import {
  GitHubConflictError,
  INTEGRATION_BRANCH,
  randomEditKey,
  type FileWrite,
} from "@swimlane-cloud/github-client";
import type { ProjectCtx } from "./projects";
import { getServiceSupabase } from "./supabase/server";

export interface PreviewCommitOptions {
  /** Short, branch-safe word naming the kind of change (`templates`). */
  kind: string;
  message: string;
  files: FileWrite[];
}

export interface PreviewCommitResult {
  /** The merge commit on preview (GitHub), or the direct commit (GitLab). */
  sha: string;
  prNumber: number | null;
}

export async function commitToPreview(
  ctx: ProjectCtx,
  projectId: string,
  opts: PreviewCommitOptions,
): Promise<PreviewCommitResult> {
  const author = { name: ctx.login, email: ctx.commitAuthorEmail };

  if (ctx.project.provider !== "github") {
    const res = await ctx.write.commitFiles({
      branch: INTEGRATION_BRANCH,
      message: opts.message,
      files: opts.files,
      author,
    });
    return { sha: res.sha, prNumber: null };
  }

  const tip = await ctx.write.refSha(INTEGRATION_BRANCH);
  const branch = `${opts.kind}-${randomEditKey()}`;
  await ctx.write.createBranchAtSha(branch, tip);

  let prNumber: number | null = null;
  let sha: string;
  try {
    await ctx.write.commitFiles({ branch, message: opts.message, files: opts.files, author });
    const pr = await ctx.pulls.createPullRequest({
      head: branch,
      base: INTEGRATION_BRANCH,
      title: opts.message.split("\n")[0] ?? opts.message,
    });
    prNumber = pr.number;
    const merged = await ctx.pulls.mergePullRequest(pr.number, { method: "merge" });
    sha = merged.sha;
  } catch (err) {
    // A pull request GitHub refuses as empty means the files already had this
    // content on preview: nothing to land, and nothing wrong.
    if (err instanceof GitHubConflictError && /No commits between/i.test(err.message)) {
      await ctx.repos.deleteBranch(branch);
      return { sha: tip, prNumber: null };
    }
    await ctx.repos.deleteBranch(branch);
    throw err;
  }
  await ctx.repos.deleteBranch(branch);

  if (prNumber !== null) {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("merge_requests").upsert(
      {
        project_id: projectId,
        pr_number: prNumber,
        head_branch: branch,
        base_branch: INTEGRATION_BRANCH,
        title: opts.message.split("\n")[0] ?? opts.message,
        status: "merged",
        author_id: ctx.user.id,
        author_login: ctx.login,
        merged_by_login: ctx.login,
        closed_at: new Date().toISOString(),
      },
      { onConflict: "project_id,pr_number" },
    );
    if (error) console.warn(`[preview-commit] merge_requests upsert failed: ${error.message}`);
  }
  return { sha, prNumber };
}
