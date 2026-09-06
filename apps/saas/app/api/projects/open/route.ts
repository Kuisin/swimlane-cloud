import { INTEGRATION_BRANCH, PROD_BRANCH } from "@swimlane-cloud/github-client";
import { withApi, json, readJson } from "@/lib/api";
import { ensureProject } from "@/lib/discovery";
import { withRepo } from "@/lib/github";
import { assertOwnerRepo } from "@/lib/guard";
import { requireUserWithGitHub } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/projects/open {owner, repo} → {projectId}
 * Registers a marked repository the user can see, or returns its existing id.
 */
export const POST = withApi(async (req) => {
  const ctx = await requireUserWithGitHub();
  const { repos, login, user } = ctx;
  const body = await readJson<{ owner?: string; repo?: string }>(req);
  if (!body.owner || !body.repo) throw new Error("owner and repo are required");
  assertOwnerRepo(body.owner, body.repo);

  const info = await repos.getRepo(body.owner, body.repo);
  if (info.permissions.push) {
    // Best-effort: a repository marked before `preview` existed, or opened by
    // deep link rather than through /new, may still be missing it. Nothing
    // downstream depends on this succeeding immediately — `state.ts` retries
    // the same thing on every load for anyone who can push.
    try {
      await withRepo(ctx, { owner: info.owner, repo: info.name }).write.ensureBranch(
        INTEGRATION_BRANCH,
        PROD_BRANCH,
      );
    } catch {
      /* best-effort */
    }
  }
  const result = await ensureProject(info, { userId: user.id, login });
  return json({ projectId: result.projectId, created: result.created }, result.created ? 201 : 200);
});
