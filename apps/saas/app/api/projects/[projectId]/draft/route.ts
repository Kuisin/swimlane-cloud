import { withApi, json, readJson, ApiError } from "@/lib/api";
import { getServiceSupabase } from "@/lib/supabase/server";
import { loadProjectTemplates, requireUser } from "@/lib/projects";
import { assertForcedSections } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DraftBody {
  branch: string;
  files: { id: string; dsl: string }[];
}

/**
 * POST /api/projects/[projectId]/draft — upsert diagram_drafts by
 * (project_id, filepath_in_repo, branch). No Gitea call (plan Step 1.5).
 * Runs forced-section validation on each draft before persisting.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const user = await requireUser();
  const body = await readJson<DraftBody>(req);
  if (!body.branch) throw new ApiError(400, "branch is required");
  if (!Array.isArray(body.files) || body.files.length === 0) {
    throw new ApiError(400, "files[] is required");
  }

  // Validate forced sections (skip .gitkeep / template mirror paths).
  const { policies, templatesById } = await loadProjectTemplates(projectId);
  const hasForced = Object.values(policies).some((p) => p.mode === "forced");
  if (hasForced) {
    for (const f of body.files) {
      if (!f.id.endsWith(".txt")) continue;
      if (f.id.startsWith("templates/")) continue;
      assertForcedSections(f.dsl, policies, templatesById);
    }
  }

  const supabase = getServiceSupabase();
  const rows = body.files.map((f) => ({
    project_id: projectId,
    filepath_in_repo: f.id,
    branch: body.branch,
    dsl_text: f.dsl,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("diagram_drafts")
    .upsert(rows, { onConflict: "project_id,filepath_in_repo,branch" });
  if (error) throw new ApiError(500, `draft upsert failed: ${error.message}`);

  return json({ saved: rows.length });
});
