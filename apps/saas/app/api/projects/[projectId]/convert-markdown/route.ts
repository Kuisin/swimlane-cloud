import { withApi, json, readJson, ApiError } from "@/lib/api";
import { planMarkdownConversion } from "@/lib/convert-markdown";
import { moveFileId } from "@/lib/file-ids";
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

interface ConvertBody {
  branch: string;
}

/** The same ceiling `snapshotAt` uses: a bulk action should 413, not time out. */
const CONVERT_LIMIT = 300;

/**
 * POST /api/projects/[projectId]/convert-markdown — rewrite every `.txt`
 * diagram on a branch as a `.md`, in **one commit**.
 *
 * One commit is the whole point: it reviews as a normal pull request and
 * reverts as a single revert. The conversion is reversible in content too —
 * `/meta/` moves into frontmatter and the DSL goes inside a fence, and reading
 * it back returns the original bytes.
 *
 * Two things this refuses rather than guesses at:
 *
 * - **Pending drafts.** A draft row is keyed by path, so an unpushed edit to
 *   `flow.txt` would resurrect that file at the next push, undoing half the
 *   conversion. Push or discard first.
 * - **A `.md` already in the way.** Overwriting someone's document is not an
 *   undoable step inside a bulk action.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const body = await readJson<ConvertBody>(req);
  if (!body.branch) throw new ApiError(400, "branch is required");
  assertRef(body.branch);

  const project = await requireProjectRole(projectId, "editor");
  assertBranchWritable(body.branch, project.role, await lockedBranches(project));

  if (await hasPendingDrafts(projectId, body.branch)) {
    throw new ApiError(
      409,
      "Push or discard your pending changes before converting — an unpushed edit would bring its .txt back.",
    );
  }

  const sha = await resolveSha(project, body.branch);
  const { files } = await listDiagramFiles(project, sha);
  const sources = files.filter((p) => p.toLowerCase().endsWith(".txt"));
  if (sources.length === 0) {
    return json({ converted: 0, commitSha: null, branch: body.branch });
  }
  if (sources.length > CONVERT_LIMIT) {
    throw new ApiError(413, `Too many diagrams to convert at once (${sources.length}).`);
  }

  const texts = await mapLimit(sources, 8, (p) => readTextAt(project, p, sha));
  const contents: Record<string, string> = {};
  sources.forEach((p, i) => {
    const text = texts[i];
    if (typeof text === "string") contents[p] = text;
  });

  const plan = planMarkdownConversion(contents, files);
  if (plan.conflicts.length) {
    throw new ApiError(
      409,
      `Already present, so nothing was converted: ${plan.conflicts.slice(0, 5).join(", ")}.`,
    );
  }

  const result = await project.write.commitFiles({
    branch: body.branch,
    message: `Store diagrams as Markdown (${plan.renames.length} file${
      plan.renames.length === 1 ? "" : "s"
    })\n\nEach diagram's /meta/ becomes frontmatter and its DSL moves inside a\nkai-swimlane fence. Imports between converted files are repointed.`,
    files: plan.writes.map((w) => ({ path: w.path, text: w.text })),
    deletions: plan.deletions,
    expectedHeadSha: sha,
    author: { name: project.login, email: project.commitAuthorEmail },
  });

  // File identities are what `?fid=` deep links resolve through, and GitHub
  // will not report these as renames — frontmatter and a fence change the file
  // too much for its similarity heuristic — so they are moved explicitly.
  for (const { from, to } of plan.renames) {
    try {
      await moveFileId(projectId, from, to);
    } catch (err) {
      console.warn(`[convert-markdown] could not move file id ${from} -> ${to}: ${String(err)}`);
    }
  }

  await audit({
    workspaceId: project.project.workspaceId,
    projectId,
    userId: project.user.id,
    actorLogin: project.login,
    action: "convert-markdown",
    entityType: "branch",
    entityId: body.branch,
    commitSha: result.sha,
  });

  return json({
    converted: plan.renames.length,
    commitSha: result.sha,
    branch: body.branch,
    renames: plan.renames,
  });
});
