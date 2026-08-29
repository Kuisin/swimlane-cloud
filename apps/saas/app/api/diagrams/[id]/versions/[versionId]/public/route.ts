import { withApi, json, readJson, ApiError } from "@/lib/api";
import { getServiceSupabase } from "@/lib/supabase/server";
import { audit, getRepoCoords, randomSlug, requireUser } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PublicBody {
  public: boolean;
  share_mode?: "svg_only" | "svg_and_dsl";
}

/**
 * PATCH /api/diagrams/[id]/versions/[versionId]/public — toggle public sharing
 * (plan Step 2.4). Only allowed when the version is promoted_to_main.
 */
export const PATCH = withApi(
  async (req, ctx: { params: Promise<{ id: string; versionId: string }> }) => {
    const { id, versionId } = await ctx.params;
    const user = await requireUser();
    const body = await readJson<PublicBody>(req);

    const supabase = getServiceSupabase();
    const { data: version, error } = await supabase
      .from("versions")
      .select("id, diagram_id, promoted_to_main, public_slug")
      .eq("id", versionId)
      .eq("diagram_id", id)
      .single();
    if (error || !version) throw new ApiError(404, "version not found");

    if (body.public && !version.promoted_to_main) {
      throw new ApiError(400, "Only versions promoted to main can be made public");
    }

    const shareMode = body.public ? (body.share_mode ?? "svg_only") : null;
    if (shareMode && !["svg_only", "svg_and_dsl"].includes(shareMode)) {
      throw new ApiError(400, "invalid share_mode");
    }

    const slug = body.public ? ((version.public_slug as string | null) ?? randomSlug()) : null;

    const { error: upErr } = await supabase
      .from("versions")
      .update({
        public: body.public,
        share_mode: shareMode,
        public_slug: slug,
      })
      .eq("id", versionId);
    if (upErr) throw new ApiError(400, upErr.message);

    const { data: diagram } = await supabase
      .from("diagrams")
      .select("project_id")
      .eq("id", id)
      .single();
    const { workspaceId } = await getRepoCoords(diagram?.project_id as string);
    await audit({
      workspaceId,
      userId: user.id,
      action: body.public ? "version.shared" : "version.unshared",
      entityType: "version",
      entityId: versionId,
    });

    return json({ versionId, public: body.public, share_mode: shareMode, public_slug: slug });
  },
);
