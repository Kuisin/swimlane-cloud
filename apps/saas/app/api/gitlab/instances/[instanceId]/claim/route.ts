import { withApi, json, readJson, ApiError } from "@/lib/api";
import { claimWorkspaceForInstance } from "@/lib/gitlab-instances";
import { requireUser } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ClaimBody {
  namespacePath: string;
}

/**
 * POST /api/gitlab/instances/[instanceId]/claim — bind an unclaimed
 * instance to a new workspace, keyed by a GitLab group the caller owns.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ instanceId: string }> }) => {
  const { instanceId } = await ctx.params;
  const user = await requireUser();
  const body = await readJson<ClaimBody>(req);
  if (!body.namespacePath?.trim()) throw new ApiError(400, "namespacePath is required");
  const result = await claimWorkspaceForInstance(user.id, instanceId, body.namespacePath.trim());
  return json(result, 201);
});
