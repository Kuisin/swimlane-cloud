import { GitHubNotAccessibleError } from "@swimlane-cloud/github-client";
import { withApi, json } from "@/lib/api";
import { compareDiagrams } from "@/lib/compare";
import { parsePullNumber } from "@/lib/guard";
import { requireProjectRole } from "@/lib/projects";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { CompareFile, PullDetail } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/projects/[projectId]/pulls/[number] — the PR, its conversation and changed files. */
export const GET = withApi(
  async (_req, ctx: { params: Promise<{ projectId: string; number: string }> }) => {
    const { projectId, number } = await ctx.params;
    const n = parsePullNumber(number);
    const project = await requireProjectRole(projectId, "viewer");

    const [pull, comments] = await Promise.all([
      project.pulls.getPullRequest(n),
      project.pulls.listIssueComments(n),
    ]);

    // A merged PR's head branch is usually deleted; compare the shas instead,
    // which stay valid as long as the objects exist.
    let files: CompareFile[] = [];
    try {
      const base = pull.state === "open" ? pull.base : pull.baseSha || pull.base;
      const head = pull.state === "open" ? pull.head : pull.headSha || pull.head;
      files = (await compareDiagrams(project, base, head)).files;
    } catch (err) {
      if (!(err instanceof GitHubNotAccessibleError)) throw err;
    }

    const supabase = getServiceSupabase();
    const { data: mr } = await supabase
      .from("merge_requests")
      .select("version_id")
      .eq("project_id", projectId)
      .eq("pr_number", n)
      .maybeSingle();

    const body: PullDetail = {
      pull: {
        number: pull.number,
        title: pull.title,
        head: pull.head,
        base: pull.base,
        headSha: pull.headSha,
        baseSha: pull.baseSha,
        state: pull.state,
        merged: pull.merged,
        author: pull.author,
        htmlUrl: pull.htmlUrl,
        createdAt: pull.createdAt,
        mergedAt: pull.mergedAt,
        closedAt: pull.closedAt,
        commentCount: pull.commentCount,
        versionId: (mr?.version_id as string | null) ?? null,
      },
      comments,
      files,
    };
    return json(body);
  },
);
