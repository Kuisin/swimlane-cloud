import {
  INTEGRATION_BRANCH,
  isIntegrationBranch,
  isTmpBranch,
} from "@swimlane-cloud/github-client";
import { withApi, json, readJson, ApiError } from "@/lib/api";
import { assertRef } from "@/lib/guard";
import { audit, requireProjectRole } from "@/lib/projects";
import { hasPendingDrafts } from "@/lib/repo-files";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface OpenBody {
  head: string;
  title?: string;
  body?: string;
}

/**
 * POST /api/projects/[projectId]/pulls — open (or reuse) the pull request from
 * a tmp-* branch into test. `test` itself never gets a pull request from
 * here: production is reached by promoting a flagged version.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const body = await readJson<OpenBody>(req);
  if (!body.head) throw new ApiError(400, "head is required");
  assertRef(body.head);
  if (isIntegrationBranch(body.head)) {
    throw new ApiError(
      400,
      "test is promoted to main from the Versions tab, not by pull request.",
      {
        promoteViaVersions: true,
      },
    );
  }
  if (!isTmpBranch(body.head)) throw new ApiError(400, "Only tmp-* branches open pull requests.");

  const project = await requireProjectRole(projectId, "editor");

  if (await hasPendingDrafts(projectId, body.head)) {
    throw new ApiError(409, "This branch has unsaved drafts. Checkpoint them first.", {
      dirty: true,
    });
  }

  const open = await project.pulls.listPullRequests({ head: body.head, state: "open" });
  const reused = open[0];
  const pull =
    reused ??
    (await project.pulls.createPullRequest({
      head: body.head,
      base: INTEGRATION_BRANCH,
      title: body.title?.trim() || `Update diagrams (${body.head})`,
      ...(body.body ? { body: body.body } : {}),
    }));

  const supabase = getServiceSupabase();
  await supabase.from("merge_requests").upsert(
    {
      project_id: projectId,
      pr_number: pull.number,
      head_branch: pull.head,
      base_branch: pull.base,
      title: pull.title,
      status: "open",
      author_id: project.user.id,
      author_login: pull.author || project.login,
    },
    { onConflict: "project_id,pr_number" },
  );
  if (!reused) {
    await audit({
      workspaceId: project.project.workspaceId,
      projectId,
      userId: project.user.id,
      actorLogin: project.login,
      action: "pull.opened",
      entityType: "pull",
      entityId: String(pull.number),
    });
  }
  return json(
    { number: pull.number, htmlUrl: pull.htmlUrl, base: pull.base, reused: Boolean(reused) },
    reused ? 200 : 201,
  );
});

/** GET ?state=open|closed|all — pull requests (also included in /state). */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const state = (url.searchParams.get("state") ?? "open") as "open" | "closed" | "all";
  const project = await requireProjectRole(projectId, "viewer");
  return json({ pulls: await project.pulls.listPullRequests({ state }) });
});
