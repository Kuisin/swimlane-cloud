import { withApi, json, readJson } from "@/lib/api";
import { ensureProject } from "@/lib/discovery";
import { assertOwnerRepo } from "@/lib/guard";
import { requireUserWithGitHub } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/projects/open {owner, repo} → {projectId}
 * Registers a marked repository the user can see, or returns its existing id.
 */
export const POST = withApi(async (req) => {
  const { repos, login, user } = await requireUserWithGitHub();
  const body = await readJson<{ owner?: string; repo?: string }>(req);
  if (!body.owner || !body.repo) throw new Error("owner and repo are required");
  assertOwnerRepo(body.owner, body.repo);

  const info = await repos.getRepo(body.owner, body.repo);
  const result = await ensureProject(info, { userId: user.id, login });
  return json({ projectId: result.projectId, created: result.created }, result.created ? 201 : 200);
});
