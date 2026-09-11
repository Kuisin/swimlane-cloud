import { errorResponse, ApiError } from "@/lib/api";
import { assertDiagramPath } from "@/lib/guard";
import { requireProjectRole } from "@/lib/projects";
import { render } from "@/lib/render";
import { readConfigAt } from "@/lib/repo-files";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/projects/[projectId]/versions/[versionId]/svg?path= — one file of
 * a version rendered to SVG. Version rows never change, so the response is
 * cacheable for as long as the browser likes; `private` keeps it out of
 * shared caches since it was served behind a GitHub permission check.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ projectId: string; versionId: string }> },
) {
  try {
    const { projectId, versionId } = await ctx.params;
    const path = new URL(req.url).searchParams.get("path");
    if (!path) throw new ApiError(400, "path is required");
    assertDiagramPath(path);
    const project = await requireProjectRole(projectId, "viewer");

    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("version_files")
      .select("dsl_text, versions!inner(project_id, commit_sha)")
      .eq("version_id", versionId)
      .eq("filepath", path)
      .eq("versions.project_id", projectId)
      .maybeSingle();
    if (!data) throw new ApiError(404, "No such file in this version.");

    // The settings as of the version's own commit: a version is immutable, so
    // its rendering must not shift when the repository is reconfigured later.
    const commitSha = (data as unknown as { versions: { commit_sha: string } }).versions.commit_sha;
    const config = await readConfigAt(project, commitSha);
    const { svg } = render(data.dsl_text as string, config.themeKey, config.layout);
    if (!svg) throw new ApiError(422, "This file could not be rendered.");
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
