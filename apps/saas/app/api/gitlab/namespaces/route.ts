import { withApi, json, ApiError } from "@/lib/api";
import { listOwnedNamespaces } from "@/lib/gitlab-instances";
import { requireUser } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/gitlab/namespaces?instanceId= — the caller's Owner-level GitLab
 * groups on this instance, for the claim/create namespace picker.
 */
export const GET = withApi(async (req) => {
  const user = await requireUser();
  const instanceId = new URL(req.url).searchParams.get("instanceId");
  if (!instanceId) throw new ApiError(400, "instanceId is required");
  const namespaces = await listOwnedNamespaces(user.id, instanceId);
  return json({ namespaces });
});
