import { withApi, json, readJson, ApiError } from "@/lib/api";
import { classifyChanges } from "@/lib/changes";
import { buildCommitMessage } from "@/lib/commit-message";
import { assertRef, assertRepoPath } from "@/lib/guard";
import {
  assertBranchWritable,
  audit,
  loadProjectTemplates,
  lockedBranches,
  requireProjectRole,
} from "@/lib/projects";
import { isDraftablePath, loadDraftState } from "@/lib/repo-files";
import { getServiceSupabase } from "@/lib/supabase/server";
import { assertForcedSections } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CheckpointBody {
  branch: string;
  message?: string;
  files?: { id: string; dsl: string }[];
  /** Refuse if the branch has moved past this sha (optimistic concurrency). */
  expectedHeadSha?: string;
}

/**
 * POST /api/projects/[projectId]/checkpoint — one commit ("Push to GitHub" in
 * the UI) on the branch with every draft for it (plus any files the editor
 * sends that it has not saved as drafts yet). The commit message is built
 * from the user's optional note plus an automatic list of every file
 * touched (see `commit-message.ts`), so the metadata a reviewer needs is
 * always in the commit, never only in the app's memory. Committed drafts
 * are deleted; a moved branch is a 409.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const body = await readJson<CheckpointBody>(req);
  if (!body.branch) throw new ApiError(400, "branch is required");
  assertRef(body.branch);

  const project = await requireProjectRole(projectId, "editor");
  assertBranchWritable(body.branch, project.role, await lockedBranches(project));

  // Explicit files win over stored drafts for the same path.
  const { writes, deletions } = await loadDraftState(projectId, body.branch);
  for (const f of body.files ?? []) {
    assertRepoPath(f.id);
    if (!isDraftablePath(f.id)) throw new ApiError(400, `${f.id} is not a diagram path.`);
    writes[f.id] = f.dsl;
  }
  const changedEntries = Object.entries(writes).map(([id, dsl]) => ({ id, dsl }));
  if (changedEntries.length === 0 && deletions.length === 0) {
    throw new ApiError(400, "Nothing to push — nothing has changed yet.");
  }

  const { policies, templatesById } = await loadProjectTemplates(projectId);
  for (const f of changedEntries) {
    if (f.id.endsWith(".txt")) assertForcedSections(f.dsl, policies, templatesById);
  }

  const headSha = await project.write.refSha(body.branch);
  const changes = await classifyChanges(project, headSha, writes, deletions);
  const message = buildCommitMessage({
    userMessage: body.message,
    changes,
    author: project.login,
    branch: body.branch,
  });

  const result = await project.write.commitFiles({
    branch: body.branch,
    message,
    files: changedEntries.map((f) => ({ path: f.id, text: f.dsl })),
    ...(deletions.length ? { deletions } : {}),
    ...(body.expectedHeadSha ? { expectedHeadSha: body.expectedHeadSha } : {}),
    author: { name: project.login, email: `${project.login}@users.noreply.github.com` },
  });

  const supabase = getServiceSupabase();
  await supabase
    .from("drafts")
    .delete()
    .eq("project_id", projectId)
    .eq("branch", body.branch)
    .in("filepath", [...changedEntries.map((f) => f.id), ...deletions]);

  await audit({
    workspaceId: project.project.workspaceId,
    projectId,
    userId: project.user.id,
    actorLogin: project.login,
    action: "checkpoint",
    entityType: "branch",
    entityId: body.branch,
    commitSha: result.sha,
  });

  return json({
    commitSha: result.sha,
    branch: body.branch,
    files: changedEntries.length,
    deleted: deletions.length,
    changes,
    subject: message.split("\n")[0],
  });
});
