import { withApi, json } from "@/lib/api";
import { PROJECT_TOPIC } from "@/lib/discovery";
import { requireUserWithGitHub } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/github/repos — repositories the user administers that are NOT yet
 * marked as projects: the candidates for "mark an existing repository".
 */
export const GET = withApi(async () => {
  const { repos } = await requireUserWithGitHub();
  const all = await repos.listAccessibleRepos();
  return json({
    repos: all
      .filter((r) => r.permissions.admin && !r.topics.includes(PROJECT_TOPIC))
      .map((r) => ({
        owner: r.owner,
        repo: r.name,
        fullName: r.fullName,
        private: r.private,
        htmlUrl: r.htmlUrl,
        description: r.description,
        pushedAt: r.pushedAt,
      })),
  });
});
