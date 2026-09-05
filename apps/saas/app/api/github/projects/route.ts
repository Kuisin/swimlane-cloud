import { withApi, json } from "@/lib/api";
import { discoverProjects, PROJECT_TOPIC } from "@/lib/discovery";
import { requireUserWithGitHub } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/github/projects — every repository the signed-in user can reach on
 * GitHub that carries the `swimlane` topic, with the role their permissions
 * grant and the project id if it has been opened here before.
 */
export const GET = withApi(async () => {
  const { repos, login } = await requireUserWithGitHub();
  const accessible = await repos.listAccessibleRepos({ topic: PROJECT_TOPIC });
  const { repos: discovered } = await discoverProjects(accessible);
  return json({ login, topic: PROJECT_TOPIC, repos: discovered });
});
