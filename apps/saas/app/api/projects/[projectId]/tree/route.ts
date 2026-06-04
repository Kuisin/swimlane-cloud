import { withApi, json } from "@/lib/api";
import { getGitea } from "@/lib/gitea";
import { getRepoCoords } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/projects/[projectId]/tree?branch=  — recursive list of .txt files
 * at the branch ref (plan Step 1.1 / folder-first listing).
 */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const branch = url.searchParams.get("branch") ?? "test";

  const { org, repo } = await getRepoCoords(projectId);
  const gitea = getGitea();
  const tree = await gitea.listTree(org, repo, branch, { ext: ".txt" });

  const files = tree
    .filter((e) => !e.path.startsWith("templates/"))
    .map((e) => ({
      id: e.path,
      name: e.path.split("/").pop() ?? e.path,
    }));

  return json({ branch, files });
});
