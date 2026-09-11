import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { withApi, json } from "@/lib/api";
import { assertRef } from "@/lib/guard";
import { requireProjectRole } from "@/lib/projects";
import {
  draftsApplyTo,
  isDraftablePath,
  isFolderMarker,
  loadDraftState,
  resolveSha,
  snapshotAt,
} from "@/lib/repo-files";
import type { SnapshotResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/projects/[projectId]/snapshot?ref=&withDrafts=1 — every diagram's
 * text at a ref. With `withDrafts` on an edit branch, uncommitted drafts
 * overlay the committed text (what the mobile view edits). `main` and
 * `preview` are always the committed text: neither is ever edited directly.
 */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref") ?? INTEGRATION_BRANCH;
  const withDrafts = url.searchParams.get("withDrafts") === "1";
  assertRef(ref);

  const project = await requireProjectRole(projectId, "viewer");
  const sha = await resolveSha(project, ref);
  const snap = await snapshotAt(project, sha);
  const files = { ...snap.files };
  if (withDrafts && draftsApplyTo(ref)) {
    const { writes, deletions } = await loadDraftState(projectId, ref);
    for (const [p, text] of Object.entries(writes)) {
      if (isDraftablePath(p) && !isFolderMarker(p)) files[p] = text;
    }
    for (const p of deletions) delete files[p];
  }
  const body: SnapshotResponse = { sha, files };
  return json(body);
});
