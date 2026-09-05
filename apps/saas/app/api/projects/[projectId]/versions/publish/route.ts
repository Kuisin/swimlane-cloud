import { withApi, json, readJson, ApiError } from "@/lib/api";
import { requireProjectRole } from "@/lib/projects";
import { publishRelease } from "@/lib/versions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PublishBody {
  name: string;
  note?: string;
}

/**
 * POST /api/projects/[projectId]/versions/publish — 公開する / Publish:
 * flag preview as version `name` (a semver, becomes the tag itself) and
 * promote it to main in one request. See `src/lib/versions.ts publishRelease`.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const body = await readJson<PublishBody>(req);
  if (!body.name?.trim()) throw new ApiError(400, "name is required");

  const project = await requireProjectRole(projectId, "owner");
  if (project.project.provider !== "github") {
    throw new ApiError(
      400,
      "Publishing is only available for GitHub-backed projects in this release.",
    );
  }
  const result = await publishRelease(project, projectId, body);
  return json(result, 201);
});
