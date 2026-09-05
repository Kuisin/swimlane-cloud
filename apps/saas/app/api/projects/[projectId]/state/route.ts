import { withApi, json } from "@/lib/api";
import { requireProjectRole } from "@/lib/projects";
import { buildProjectState } from "@/lib/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/projects/[projectId]/state — everything the project tabs render. */
export const GET = withApi(async (_req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectRole(projectId, "viewer");
  return json(await buildProjectState(project));
});
