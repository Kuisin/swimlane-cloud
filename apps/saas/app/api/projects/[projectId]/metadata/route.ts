import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { withApi, json } from "@/lib/api";
import { assertRef } from "@/lib/guard";
import { loadMetadataFields, metadataEntryOf, metadataProblemsForFile } from "@/lib/metadata";
import { requireProjectRole } from "@/lib/projects";
import {
  draftsApplyTo,
  isDraftablePath,
  isFolderMarker,
  loadDraftState,
  resolveSha,
  snapshotAt,
} from "@/lib/repo-files";
import type { MetadataResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/projects/[projectId]/metadata?ref=&withDrafts=1 — every document at
 * a ref with the metadata it carries, so the browser can search and filter the
 * project by it.
 *
 * Built on the same `snapshotAt` the snapshot route uses, over the same
 * `SNAPSHOT_LIMIT`: one read per file, and no second full-repository read path
 * to keep in step with `.swimlane.json`. Only the metadata is returned — the
 * file bodies stay on the server, which is the whole reason this is not just
 * the snapshot route with a filter applied in the browser.
 */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref") ?? INTEGRATION_BRANCH;
  const withDrafts = url.searchParams.get("withDrafts") !== "0";
  assertRef(ref);

  const project = await requireProjectRole(projectId, "viewer");
  const sha = await resolveSha(project, ref);
  const snap = await snapshotAt(project, sha);

  const texts = { ...snap.files };
  if (withDrafts && draftsApplyTo(ref)) {
    const { writes, deletions } = await loadDraftState(projectId, ref);
    for (const [path, text] of Object.entries(writes)) {
      if (isDraftablePath(path) && !isFolderMarker(path)) texts[path] = text;
    }
    for (const path of deletions) delete texts[path];
  }

  const fields = await loadMetadataFields(project);
  const documents: MetadataResponse["documents"] = [];
  for (const path of Object.keys(texts).sort()) {
    const text = texts[path] ?? "";
    const entry = metadataEntryOf(path, text);
    if (entry === null) continue;
    documents.push({
      path,
      meta: entry.meta,
      carried: entry.carried,
      problems: metadataProblemsForFile(path, text, fields),
    });
  }

  const body: MetadataResponse = { ref, sha, documents, truncated: snap.truncated };
  return json(body);
});
