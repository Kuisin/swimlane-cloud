import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { withApi, json } from "@/lib/api";
import { assertRef } from "@/lib/guard";
import { ensureFileIds } from "@/lib/file-ids";
import { requireProjectRole } from "@/lib/projects";
import {
  draftsApplyTo,
  isDraftablePath,
  isFolderMarker,
  listDiagramFiles,
  loadDraftState,
  resolveSha,
} from "@/lib/repo-files";
import type { TreeResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/projects/[projectId]/tree?ref= — every diagram at the ref. On an
 * edit branch, draft-only paths (files created here but not yet
 * checkpointed) are added and pending deletions removed, so the listing is
 * what the editor should show rather than what git alone has. `drafts` names
 * which listed paths read from a draft and when that draft was last saved:
 * with `sha` it pins the exact version of every file, which is what lets the
 * browser reuse cached text safely.
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
  const drafts: Record<string, string> = {};
  if (draftsApplyTo(ref)) {
    const { writes, deletions, updatedAt } = await loadDraftState(projectId, ref);
    for (const p of Object.keys(writes)) {
      // `isDraftablePath` also admits `.gitkeep` folder markers, which are not
      // files the tree should list.
      if (!isDraftablePath(p) || isFolderMarker(p)) continue;
      if (!known.has(p)) ids.push(p);
      if (updatedAt[p]) drafts[p] = updatedAt[p];
    }
    // A file deleted in the editor is gone from the tree straight away, even
    // though it only leaves git at the next checkpoint.
    if (deletions.length) {
      const gone = new Set(deletions);
      ids = ids.filter((p) => !gone.has(p));
      for (const p of gone) delete drafts[p];
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
    drafts,
    truncated,
    diagramsRoot: config.diagramsRoot,
  };
  return json(body);
});
