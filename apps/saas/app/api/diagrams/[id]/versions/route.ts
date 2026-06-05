import { withApi, json, readJson, ApiError } from "@/lib/api";
import { getGitea } from "@/lib/gitea";
import { getServiceSupabase } from "@/lib/supabase/server";
import { audit, getRepoCoords, requireUser, slugify } from "@/lib/projects";
import { resolveSvgBlob } from "@/lib/svg-blobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface FlagBody {
  commitSha: string;
  branch?: string;
  name: string;
  note?: string;
}

/**
 * POST /api/diagrams/[id]/versions — flag a commit as a new version (plan
 * Step 2.1). Allowed ONLY on `test`. This is the only server-SVG trigger.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const body = await readJson<FlagBody>(req);
  if (!body.commitSha) throw new ApiError(400, "commitSha is required");
  if (!body.name) throw new ApiError(400, "name is required");

  const branch = body.branch ?? "test";
  if (branch !== "test") {
    throw new ApiError(400, "New version can only be flagged on test");
  }

  const supabase = getServiceSupabase();
  const { data: diagram, error: dErr } = await supabase
    .from("diagrams")
    .select("id, project_id, filepath_in_repo, theme_key")
    .eq("id", id)
    .single();
  if (dErr || !diagram) throw new ApiError(404, "diagram not found");

  const { org, repo, workspaceId } = await getRepoCoords(
    diagram.project_id as string,
  );
  const gitea = getGitea();

  // Confirm the commit really belongs to test.
  if (!(await gitea.commitOnBranch(org, repo, "test", body.commitSha))) {
    throw new ApiError(400, "commitSha is not on the test branch");
  }

  // Read DSL at the exact ref, render + dedup SVG.
  const dslText = await gitea.readFileText(
    org,
    repo,
    diagram.filepath_in_repo as string,
    body.commitSha,
  );
  const { blobId } = await resolveSvgBlob({
    dslText,
    themeKey: (diagram.theme_key as string) ?? "basic",
  });

  const { data: version, error: vErr } = await supabase
    .from("versions")
    .insert({
      diagram_id: id,
      name: body.name,
      commit_sha: body.commitSha,
      branch: "test",
      svg_blob_id: blobId,
      is_new_version: true,
      promoted_to_main: false,
      public: false,
      share_mode: null,
      note: body.note ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (vErr) throw new ApiError(400, `version insert failed: ${vErr.message}`);

  // Create a git tag pointing at the flagged commit.
  await gitea.createTag(
    org,
    repo,
    `${slugify(body.name)}-${(version.id as string).slice(0, 8)}`,
    body.commitSha,
    body.note,
  );

  await audit({
    workspaceId,
    userId: user.id,
    action: "version.flagged",
    entityType: "version",
    entityId: version.id as string,
    commitSha: body.commitSha,
  });

  return json({ versionId: version.id, svgBlobId: blobId }, 201);
});

/** GET /api/diagrams/[id]/versions — list versions for a diagram. */
export const GET = withApi(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("versions")
    .select(
      "id, name, commit_sha, branch, is_new_version, promoted_to_main, public, share_mode, public_slug, note, created_at, svg_blobs(svg_storage_path)",
    )
    .eq("diagram_id", id)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(500, error.message);
  return json({ versions: data ?? [] });
});
