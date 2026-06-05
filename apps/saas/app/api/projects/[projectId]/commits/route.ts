import { withApi, json } from "@/lib/api";
import { getGitea } from "@/lib/gitea";
import { getRepoCoords } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/projects/[projectId]/commits?branch=&limit=&page=
 * Commit history for a branch (plan Step 1.6).
 */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const branch = url.searchParams.get("branch") ?? "test";
  const limit = Number(url.searchParams.get("limit") ?? "30");
  const page = Number(url.searchParams.get("page") ?? "1");

  const { org, repo } = await getRepoCoords(projectId);
  const gitea = getGitea();
  const commits = await gitea.listCommits(org, repo, branch, { limit, page });
  return json({ branch, commits });
});
