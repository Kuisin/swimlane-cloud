import { errorResponse, ApiError } from "@/lib/api";
import { assertDiagramPath } from "@/lib/guard";
import { requireProjectRole } from "@/lib/projects";
import { render } from "@/lib/render";
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
    await requireProjectRole(projectId, "viewer");

    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("version_files")
      .select("dsl_text, versions!inner(project_id)")
      .eq("version_id", versionId)
      .eq("filepath", path)
      .eq("versions.project_id", projectId)
      .maybeSingle();
    if (!data) throw new ApiError(404, "No such file in this version.");

    const { svg } = render(data.dsl_text as string, "basic");
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
