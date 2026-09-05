import { withApi, json, ApiError } from "@/lib/api";
import { compareDiagrams } from "@/lib/compare";
import { assertRef } from "@/lib/guard";
import { requireProjectRole } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/projects/[projectId]/compare?base=&head= */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const base = url.searchParams.get("base");
  const head = url.searchParams.get("head");
  if (!base || !head) throw new ApiError(400, "base and head are required");
  assertRef(base);
  assertRef(head);
  const project = await requireProjectRole(projectId, "viewer");
  return json(await compareDiagrams(project, base, head));
});
