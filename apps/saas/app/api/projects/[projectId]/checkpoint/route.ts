import { withApi, json, readJson, ApiError } from "@/lib/api";
import { getGitea } from "@/lib/gitea";
import { getServiceSupabase } from "@/lib/supabase/server";
import { audit, getRepoCoords, loadProjectTemplates, requireUser } from "@/lib/projects";
import { assertForcedSections } from "@/lib/templates";
import { isProdBranch, PROD_BRANCH } from "@swimlane-cloud/github-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CheckpointBody {
  branch: string;
  message?: string;
  files?: { id: string; dsl: string }[];
}

/**
 * POST /api/projects/[projectId]/checkpoint — one git commit for all dirty
 * paths on the active tmp branch (or test). Runs assertForcedSections first,
 * clears drafts, writes audit_log. NO server SVG (plan Step 1.5).
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const user = await requireUser();
  const body = await readJson<CheckpointBody>(req);
  const branch = body.branch;
  if (!branch) throw new ApiError(400, "branch is required");
  // The rule lives in the shared branch model; the ApiError mapping stays here
  // so this route's response shape is unchanged.
  if (isProdBranch(branch)) {
    throw new ApiError(400, `Checkpoints are not allowed directly on ${PROD_BRANCH}`);
  }

  const supabase = getServiceSupabase();

  // Determine changed files: explicit list, else all dirty drafts on branch.
  let changed = body.files ?? [];
  if (changed.length === 0) {
    const { data: drafts, error } = await supabase
      .from("diagram_drafts")
      .select("filepath_in_repo, dsl_text")
      .eq("project_id", projectId)
      .eq("branch", branch);
    if (error) throw new ApiError(500, `draft load failed: ${error.message}`);
    changed = (drafts ?? []).map((d) => ({
      id: d.filepath_in_repo as string,
      dsl: d.dsl_text as string,
    }));
  }
  if (changed.length === 0) {
    throw new ApiError(400, "Nothing to checkpoint (no dirty drafts)");
  }

  // Forced-section validation across the whole batch before any git write.
  const { policies, templatesById } = await loadProjectTemplates(projectId);
  for (const f of changed) {
    if (!f.id.endsWith(".txt")) continue;
    if (f.id.startsWith("templates/")) continue;
    assertForcedSections(f.dsl, policies, templatesById);
  }

  // One commit touching all changed paths.
  const { org, repo, workspaceId } = await getRepoCoords(projectId);
  const gitea = getGitea();
  const { commitSha } = await gitea.multiPathCommit(
    org,
    repo,
    changed.map((f) => ({ path: f.id, text: f.dsl })),
    branch,
    body.message ?? "Checkpoint",
    user.email ? { name: user.email, email: user.email } : undefined,
  );

  // Clear committed drafts.
  await supabase
    .from("diagram_drafts")
    .delete()
    .eq("project_id", projectId)
    .eq("branch", branch)
    .in(
      "filepath_in_repo",
      changed.map((f) => f.id),
    );

  await audit({
    workspaceId,
    userId: user.id,
    action: "checkpoint",
    entityType: "project",
    entityId: projectId,
    commitSha,
  });

  return json({ commitSha, files: changed.length });
});
