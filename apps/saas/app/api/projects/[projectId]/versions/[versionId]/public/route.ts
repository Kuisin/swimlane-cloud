import { withApi, json, readJson, ApiError } from "@/lib/api";
import { audit, randomSlug, requireProjectRole } from "@/lib/projects";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PublicBody {
  public: boolean;
  share_mode?: "svg_only" | "svg_and_dsl";
}

/**
 * PATCH /api/projects/[projectId]/versions/[versionId]/public — toggle the
 * public share link of a promoted version. The slug is minted once and kept
 * across unpublish/republish so a link that was handed out keeps working.
 */
export const PATCH = withApi(
  async (req, ctx: { params: Promise<{ projectId: string; versionId: string }> }) => {
    const { projectId, versionId } = await ctx.params;
    const body = await readJson<PublicBody>(req);
    if (typeof body.public !== "boolean") throw new ApiError(400, "public must be boolean");
    const project = await requireProjectRole(projectId, "owner");

    const supabase = getServiceSupabase();
    const { data: version } = await supabase
      .from("versions")
      .select("id, promoted_to_main, public_slug")
      .eq("id", versionId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!version) throw new ApiError(404, "Version not found");
    if (body.public && !version.promoted_to_main) {
      throw new ApiError(400, "Only versions promoted to main can be shared publicly.");
    }
    const shareMode = body.public ? (body.share_mode ?? "svg_only") : null;
    if (shareMode && !["svg_only", "svg_and_dsl"].includes(shareMode)) {
      throw new ApiError(400, "share_mode must be svg_only or svg_and_dsl");
    }
    const slug = (version.public_slug as string | null) ?? randomSlug();

    const { error } = await supabase
      .from("versions")
      .update({ public: body.public, share_mode: shareMode, public_slug: slug })
      .eq("id", versionId);
    if (error) throw new ApiError(500, error.message);

    await audit({
      workspaceId: project.project.workspaceId,
      projectId,
      userId: project.user.id,
      actorLogin: project.login,
      action: body.public ? "version.shared" : "version.unshared",
      entityType: "version",
      entityId: versionId,
    });
    return json({ versionId, public: body.public, share_mode: shareMode, public_slug: slug });
  },
);
