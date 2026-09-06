import { withApi, json, readJson, ApiError } from "@/lib/api";
import { PROJECT_TOPIC } from "@/lib/discovery";
import {
  attachGitlabProject,
  createGitlabProject,
  discoverGitlabProjects,
  requireGitlabWorkspaceApis,
} from "@/lib/gitlab-discovery";
import { requireUser } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body =
  | { mode: "create"; workspaceId: string; name: string; description?: string }
  | { mode: "mark"; workspaceId: string; projectPath: string };

/**
 * GET /api/gitlab/projects?workspaceId= — every project in that workspace's
 * GitLab namespace carrying the `swimlane` topic, with the role the caller's
 * permissions grant and the project id if it has been opened here before.
 */
export const GET = withApi(async (req) => {
  const user = await requireUser();
  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (!workspaceId) throw new ApiError(400, "workspaceId is required");
  const { apis, workspace } = await requireGitlabWorkspaceApis(user.id, workspaceId);
  const { repos } = await discoverGitlabProjects(apis, workspace);
  return json({ login: apis.login, topic: PROJECT_TOPIC, repos });
});

/**
 * POST /api/gitlab/projects — create a new project in the workspace's
 * namespace, or mark an existing one. Both end by registering the project
 * row (see `src/lib/gitlab-discovery.ts`).
 */
export const POST = withApi(async (req) => {
  const user = await requireUser();
  const body = await readJson<Body>(req);
  const { apis, workspace } = await requireGitlabWorkspaceApis(user.id, body.workspaceId);
  const actor = { userId: user.id, login: apis.login };

  if (body.mode === "create") {
    if (!body.name?.trim()) throw new ApiError(400, "name is required");
    const result = await createGitlabProject(
      apis,
      workspace,
      { name: body.name.trim(), ...(body.description ? { description: body.description } : {}) },
      actor,
    );
    return json(result, 201);
  }

  if (body.mode === "mark") {
    if (!body.projectPath?.trim()) throw new ApiError(400, "projectPath is required");
    const result = await attachGitlabProject(apis, workspace, body.projectPath.trim(), actor);
    return json(result, 201);
  }

  throw new ApiError(400, "mode must be create or mark");
});
