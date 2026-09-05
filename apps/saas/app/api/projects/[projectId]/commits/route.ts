import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { withApi, json } from "@/lib/api";
import { assertRef } from "@/lib/guard";
import { requireProjectRole } from "@/lib/projects";
import type { CommitInfo } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/projects/[projectId]/commits?branch=&page=&perPage= — history, newest first. */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const branch = url.searchParams.get("branch") ?? INTEGRATION_BRANCH;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage") ?? "30") || 30));
  assertRef(branch);

  const project = await requireProjectRole(projectId, "viewer");
  const commits = await project.commits.listCommits(branch, { page, perPage });
  const body: { branch: string; commits: CommitInfo[] } = {
    branch,
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author.name,
      login: c.author.login,
      date: c.author.date,
      htmlUrl: c.htmlUrl,
      parents: c.parents,
    })),
  };
  return json(body);
});
