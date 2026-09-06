import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { withApi, json } from "@/lib/api";
import { assertRef, isSha } from "@/lib/guard";
import { ensureFileIds } from "@/lib/file-ids";
import { requireProjectRole } from "@/lib/projects";
import { isDraftablePath, listDiagramFiles, loadDraftState, resolveSha } from "@/lib/repo-files";
import type { TreeResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/projects/[projectId]/tree?ref= — every diagram at the ref, plus
 * draft-only paths (files created here but not yet checkpointed) when the
 * ref is a branch, so a new file stays visible until its first commit.
 */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref") ?? url.searchParams.get("branch") ?? INTEGRATION_BRANCH;
  assertRef(ref);

  const project = await requireProjectRole(projectId, "viewer");
  const sha = await resolveSha(project, ref);
  const { files, truncated, config } = await listDiagramFiles(project, sha);

  const known = new Set(files);
  let ids = [...files];
  if (!isSha(ref)) {
    const { writes, deletions } = await loadDraftState(projectId, ref);
    for (const p of Object.keys(writes)) {
      if (!known.has(p) && isDraftablePath(p) && p.endsWith(".txt")) ids.push(p);
    }
    // A file deleted in the editor is gone from the tree straight away, even
    // though it only leaves git at the next checkpoint.
    if (deletions.length) {
      const gone = new Set(deletions);
      ids = ids.filter((p) => !gone.has(p));
    }
  }

  const sortedIds = ids.sort();
  const fidByPath = await ensureFileIds(projectId, sortedIds);

  const body: TreeResponse = {
    ref,
    sha,
    files: sortedIds.map((id) => ({
      id,
      name: id.split("/").pop() ?? id,
      fid: fidByPath[id],
    })),
    truncated,
    diagramsRoot: config.diagramsRoot,
  };
  return json(body);
});
