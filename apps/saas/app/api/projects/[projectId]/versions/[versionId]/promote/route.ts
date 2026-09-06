import { withApi, json, ApiError } from "@/lib/api";
import { requireProjectRole } from "@/lib/projects";
import { promoteVersion } from "@/lib/versions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/projects/[projectId]/versions/[versionId]/promote — land a
 * flagged version on main (see `src/lib/versions.ts promoteVersion`). Kept
 * for legacy unpromoted versions; the one-step Publish flow calls
 * `POST …/versions/publish` instead, which flags and promotes together.
 */
export const POST = withApi(
  async (_req, ctx: { params: Promise<{ projectId: string; versionId: string }> }) => {
    const { projectId, versionId } = await ctx.params;
    const project = await requireProjectRole(projectId, "owner");
    if (project.project.provider !== "github") {
      throw new ApiError(
        400,
        "Publishing is only available for GitHub-backed projects in this release.",
      );
    }
    const result = await promoteVersion(project, projectId, versionId);
    return json({ versionId, ...result });
  },
);
