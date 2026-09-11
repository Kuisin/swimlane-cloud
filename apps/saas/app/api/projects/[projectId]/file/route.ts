import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { withApi, json, ApiError } from "@/lib/api";
import { draftVersion, gitVersion } from "@/lib/file-version";
import { assertDiagramPath, assertRef } from "@/lib/guard";
import { requireProjectRole } from "@/lib/projects";
import { draftsApplyTo, readTextAt, resolveSha } from "@/lib/repo-files";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { FileResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/projects/[projectId]/file?branch=&path= — the draft for the path
 * if one exists (edit branches only), else the committed text at the branch
 * tip. Every answer carries a `version` token (see `file-version.ts`) so the
 * browser can cache the text and know exactly when that cache still applies.
 */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const branch = url.searchParams.get("branch") ?? INTEGRATION_BRANCH;
  const path = url.searchParams.get("path");
  if (!path) throw new ApiError(400, "path is required");
  assertRef(branch);
  assertDiagramPath(path);

  const project = await requireProjectRole(projectId, "viewer");

  if (draftsApplyTo(branch)) {
    const supabase = getServiceSupabase();
    const { data: draft, error } = await supabase
      .from("drafts")
      .select("dsl_text, deleted, updated_at")
      .eq("project_id", projectId)
      .eq("filepath", path)
      .eq("branch", branch)
      .maybeSingle();
    if (error) throw new ApiError(500, `draft lookup failed: ${error.message}`);
    if (draft) {
      // A tombstone means the file is gone from this branch until the next
      // checkpoint carries the deletion. The tree already hides it; answering
      // with the tombstone's empty text here is how a deleted file came back
      // as a blank "new" diagram.
      if (draft.deleted) throw new ApiError(404, `${path} has been deleted on ${branch}.`);
      const body: FileResponse = {
        dsl: draft.dsl_text as string,
        source: "draft",
        version: draftVersion(draft.updated_at as string),
      };
      return json(body);
    }
  }

  // Read at the commit the branch points to right now, never by branch name.
  // The Contents API resolves a branch name through a cache that lags a fresh
  // commit by several seconds — long enough for the file someone just pushed
  // to come back as 404 (a brand-new file) or as its previous text. A commit
  // sha is immutable, so there is nothing for it to lag behind.
  const sha = await resolveSha(project, branch);
  const text = await readTextAt(project, path, sha);
  if (text === null) throw new ApiError(404, `${path} does not exist on ${branch}.`);
  const body: FileResponse = { dsl: text, source: "git", version: gitVersion(sha) };
  return json(body);
});
