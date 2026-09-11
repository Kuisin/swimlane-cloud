import { withApi, json, readJson, ApiError } from "@/lib/api";
import { registerGitLabInstance } from "@/lib/gitlab-instances";
import { requireUser } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RegisterBody {
  host: string;
  clientId: string;
  clientSecret: string;
  displayName: string;
}

/**
 * POST /api/gitlab/instances — register an org's self-hosted (or gitlab.com)
 * GitLab instance and the OAuth Application its admin created there. The row
 * starts unclaimed; `POST /api/gitlab/instances/:id/claim` binds it to a
 * workspace once the admin has connected (see app/api/gitlab/connect).
 */
export const POST = withApi(async (req) => {
  const user = await requireUser();
  const body = await readJson<RegisterBody>(req);
  if (!body.host?.trim()) throw new ApiError(400, "host is required");
  const { instanceId } = await registerGitLabInstance({ ...body, userId: user.id });
  return json({ instanceId }, 201);
});
