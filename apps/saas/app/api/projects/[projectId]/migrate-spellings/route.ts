import { migrateLegacySpellings } from "@swimlane-cloud/diagram-converter";
import { withApi, json, readJson, ApiError } from "@/lib/api";
import { dslOf, storedFrom } from "@/lib/diagram-file";
import { assertRef } from "@/lib/guard";
import { assertBranchWritable, audit, lockedBranches, requireProjectRole } from "@/lib/projects";
import {
  hasPendingDrafts,
  listDiagramFiles,
  mapLimit,
  readTextAt,
  resolveSha,
} from "@/lib/repo-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface MigrateBody {
  branch: string;
}

/** The same ceiling `snapshotAt` uses: a bulk action should 413, not time out. */
const MIGRATE_LIMIT = 300;

/**
 * POST /api/projects/[projectId]/migrate-spellings — rewrite the spellings the
 * grammar no longer reads (`endif`, `elseif`, …) in every diagram on a branch,
 * in **one commit**, so a repository written before the change opens again.
 *
 * Same shape as convert-markdown: refuses pending drafts (an unpushed edit to
 * a rewritten file would bring the old spelling back at the next push), and
 * lands as a single reviewable, revertable commit.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const body = await readJson<MigrateBody>(req);
  if (!body.branch) throw new ApiError(400, "branch is required");
  assertRef(body.branch);

  const project = await requireProjectRole(projectId, "editor");
  assertBranchWritable(body.branch, project.role, await lockedBranches(project));

  if (await hasPendingDrafts(projectId, body.branch)) {
    throw new ApiError(
      409,
      "Push or discard your pending changes before updating spellings — an unpushed edit would bring the old ones back.",
    );
  }

  const sha = await resolveSha(project, body.branch);
  const { files } = await listDiagramFiles(project, sha);
  if (files.length > MIGRATE_LIMIT) {
    throw new ApiError(413, `Too many diagrams to update at once (${files.length}).`);
  }

  const texts = await mapLimit(files, 8, (p) => readTextAt(project, p, sha));
  const writes: { path: string; text: string }[] = [];
  let lines = 0;
  files.forEach((p, i) => {
    const stored = texts[i];
    if (typeof stored !== "string") return;
    const dsl = dslOf(p, stored);
    if (dsl === null) return;
    const { text, changed } = migrateLegacySpellings(dsl);
    if (!changed) return;
    lines += changed;
    writes.push({ path: p, text: storedFrom(p, text, stored) });
  });
  if (writes.length === 0) {
    return json({ updated: 0, lines: 0, commitSha: null, branch: body.branch });
  }

  const result = await project.write.commitFiles({
    branch: body.branch,
    message: `Update DSL spellings (${writes.length} file${writes.length === 1 ? "" : "s"})\n\nendif → end-if, endfork → end-fork, elseif → else-if, and the older\nsection openers and closers, which the grammar no longer reads.`,
    files: writes,
    deletions: [],
    expectedHeadSha: sha,
    author: { name: project.login, email: project.commitAuthorEmail },
  });

  await audit({
    workspaceId: project.project.workspaceId,
    projectId,
    userId: project.user.id,
    actorLogin: project.login,
    action: "migrate-spellings",
    entityType: "branch",
    entityId: body.branch,
    commitSha: result.sha,
  });

  return json({ updated: writes.length, lines, commitSha: result.sha, branch: body.branch });
});
