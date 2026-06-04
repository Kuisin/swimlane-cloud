import { withApi, json, ApiError } from "@/lib/api";
import { getGitea } from "@/lib/gitea";
import { getRepoCoords } from "@/lib/projects";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/projects/[projectId]/file?branch=&path=
 * Returns the draft row for the path if present, else the git contents at the
 * branch ref (plan Step 1.1 `read`).
 */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const branch = url.searchParams.get("branch") ?? "test";
  const path = url.searchParams.get("path");
  if (!path) throw new ApiError(400, "path is required");

  const supabase = getServiceSupabase();
  const { data: draft } = await supabase
    .from("diagram_drafts")
    .select("dsl_text")
    .eq("project_id", projectId)
    .eq("filepath_in_repo", path)
    .eq("branch", branch)
    .maybeSingle();

  if (draft) {
    return json({ dsl: draft.dsl_text as string, source: "draft" });
  }

  const { org, repo } = await getRepoCoords(projectId);
  const gitea = getGitea();
  const text = await gitea.readFileText(org, repo, path, branch);
  return json({ dsl: text, source: "git" });
});
