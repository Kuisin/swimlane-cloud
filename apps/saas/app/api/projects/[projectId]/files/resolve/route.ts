import { withApi, json, ApiError } from "@/lib/api";
import { requireProjectRole } from "@/lib/projects";
import { resolveFileId } from "@/lib/file-ids";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/projects/[projectId]/files/resolve?fid= — the file id's current
 * path, so a deep link built around `fid` (rather than a folder path) keeps
 * opening the same file after it moves. Identity is per-project, not
 * per-branch — the same as the `drafts` table treats a path as one file
 * across main/test/tmp-* — so no `branch` param is needed here.
 */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const fid = url.searchParams.get("fid");
  if (!fid) throw new ApiError(400, "fid is required");

  await requireProjectRole(projectId, "viewer");

  const path = await resolveFileId(projectId, fid);
  return json({ path });
});
