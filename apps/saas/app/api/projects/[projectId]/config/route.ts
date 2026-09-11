import {
  DEFAULT_REPO_CONFIG,
  INTEGRATION_BRANCH,
  parseRepoConfig,
  REPO_CONFIG_PATH,
} from "@swimlane-cloud/github-client";
import { withApi, json } from "@/lib/api";
import { assertRef } from "@/lib/guard";
import { branchLockReason, lockedBranches, requireProjectRole } from "@/lib/projects";
import { readTextAt } from "@/lib/repo-files";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { RepoConfigResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/projects/[projectId]/config?branch= — the repo-wide settings for a
 * branch: the pending draft if the settings editor has one, else the committed
 * file, else the defaults.
 *
 * A route of its own rather than a relaxation of `file/route.ts`, whose
 * `assertDiagramPath` is the diagram editor's contract and should stay that
 * way. `editable` comes back with the config so the page can render read-only
 * without a second round trip.
 */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const branch = url.searchParams.get("branch") ?? INTEGRATION_BRANCH;
  assertRef(branch);

  const project = await requireProjectRole(projectId, "viewer");

  const supabase = getServiceSupabase();
  const { data: draft } = await supabase
    .from("drafts")
    .select("dsl_text, deleted")
    .eq("project_id", projectId)
    .eq("filepath", REPO_CONFIG_PATH)
    .eq("branch", branch)
    .maybeSingle();

  const draftText = draft && !draft.deleted ? (draft.dsl_text as string) : null;
  const committed = draftText === null ? await readTextAt(project, REPO_CONFIG_PATH, branch) : null;
  const raw = draftText ?? committed;

  const lockReason = branchLockReason(branch, project.role, await lockedBranches(project));

  const body: RepoConfigResponse = {
    branch,
    path: REPO_CONFIG_PATH,
    source: draftText !== null ? "draft" : committed !== null ? "git" : "default",
    raw,
    config: parseRepoConfig(raw),
    defaults: DEFAULT_REPO_CONFIG,
    editable: lockReason === null,
    lockReason,
  };
  return json(body);
});
