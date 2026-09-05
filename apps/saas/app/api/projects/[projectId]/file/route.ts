import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { withApi, json, ApiError } from "@/lib/api";
import { assertDiagramPath, assertRef } from "@/lib/guard";
import { requireProjectRole } from "@/lib/projects";
import { readTextAt } from "@/lib/repo-files";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/projects/[projectId]/file?branch=&path= — the draft for the path
 * if one exists, else the committed text at the branch tip.
 */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const branch = url.searchParams.get("branch") ?? INTEGRATION_BRANCH;
  const path = url.searchParams.get("path");
  if (!path) throw new ApiError(400, "path is required");
  assertRef(branch);
  assertDiagramPath(path);

  const project = await requireProjectRole(projectId, "viewer");

  const supabase = getServiceSupabase();
  const { data: draft } = await supabase
    .from("drafts")
    .select("dsl_text")
    .eq("project_id", projectId)
    .eq("filepath", path)
    .eq("branch", branch)
    .maybeSingle();
  if (draft) return json({ dsl: draft.dsl_text as string, source: "draft" });

  const text = await readTextAt(project, path, branch);
  if (text === null) throw new ApiError(404, `${path} does not exist on ${branch}.`);
  return json({ dsl: text, source: "git" });
});
