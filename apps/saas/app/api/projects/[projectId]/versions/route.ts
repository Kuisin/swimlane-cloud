import { withApi, json, readJson, ApiError } from "@/lib/api";
import { requireProjectRole } from "@/lib/projects";
import { getServiceSupabase } from "@/lib/supabase/server";
import { flagVersion } from "@/lib/versions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface FlagBody {
  name: string;
  note?: string;
  commitSha?: string;
}

/**
 * POST /api/projects/[projectId]/versions — flag a commit on preview as a
 * version (see `src/lib/versions.ts flagVersion`). Kept for the legacy
 * two-step flag-then-promote path; the one-step Publish flow calls
 * `POST …/versions/publish` instead.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const body = await readJson<FlagBody>(req);
  if (!body.name?.trim()) throw new ApiError(400, "name is required");

  const project = await requireProjectRole(projectId, "owner");
  if (project.project.provider !== "github") {
    throw new ApiError(
      400,
      "Publishing is only available for GitHub-backed projects in this release.",
    );
  }
  const result = await flagVersion(project, projectId, body);
  return json(result, 201);
});

/** GET — versions of the project, newest first (also part of /state). */
export const GET = withApi(async (_req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  await requireProjectRole(projectId, "viewer");
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("versions")
    .select(
      "id, name, note, commit_sha, tag_name, promoted_to_main, promoted_sha, public, share_mode, public_slug, created_at, created_by_login",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(500, error.message);
  return json({ versions: data ?? [] });
});
