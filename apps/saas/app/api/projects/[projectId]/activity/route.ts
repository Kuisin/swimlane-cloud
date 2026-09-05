import { withApi, json, ApiError } from "@/lib/api";
import { requireProjectRole } from "@/lib/projects";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/projects/[projectId]/activity?limit= — the audit trail, newest first. */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const limit = Math.min(
    200,
    Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? "50") || 50),
  );
  await requireProjectRole(projectId, "viewer");
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor_login, action, entity_type, entity_id, commit_sha, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new ApiError(500, error.message);
  return json({
    entries: (data ?? []).map((r) => ({
      id: r.id as string,
      actor: (r.actor_login as string | null) ?? null,
      action: r.action as string,
      entityType: (r.entity_type as string | null) ?? null,
      entityId: (r.entity_id as string | null) ?? null,
      commitSha: (r.commit_sha as string | null) ?? null,
      createdAt: r.created_at as string,
    })),
  });
});
