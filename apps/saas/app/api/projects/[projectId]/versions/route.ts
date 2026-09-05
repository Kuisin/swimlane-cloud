import { GitHubConflictError, INTEGRATION_BRANCH, slugify } from "@swimlane-cloud/github-client";
import { withApi, json, readJson, ApiError } from "@/lib/api";
import { assertSha } from "@/lib/guard";
import { audit, requireProjectRole } from "@/lib/projects";
import { render } from "@/lib/render";
import { hasPendingDrafts, snapshotAt } from "@/lib/repo-files";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface FlagBody {
  name: string;
  note?: string;
  /** Defaults to the tip of test; must be reachable from test otherwise. */
  commitSha?: string;
}

/**
 * POST /api/projects/[projectId]/versions — flag a commit on test as a
 * version: snapshot every diagram's DSL into Postgres (so the public page
 * never needs GitHub) and tag the commit. Nothing is rendered here; SVG is
 * produced on request from the snapshot.
 */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const body = await readJson<FlagBody>(req);
  const name = body.name?.trim();
  if (!name) throw new ApiError(400, "name is required");

  const project = await requireProjectRole(projectId, "owner");

  const testSha = await project.write.refSha(INTEGRATION_BRANCH);
  let sha = testSha;
  if (body.commitSha && body.commitSha !== testSha) {
    assertSha(body.commitSha);
    if (!(await project.commits.isAncestor(body.commitSha, INTEGRATION_BRANCH))) {
      throw new ApiError(
        400,
        `Commit ${body.commitSha.slice(0, 7)} is not on ${INTEGRATION_BRANCH}.`,
      );
    }
    sha = body.commitSha;
  }

  if (sha === testSha && (await hasPendingDrafts(projectId, INTEGRATION_BRANCH))) {
    throw new ApiError(409, "test has unsaved drafts. Checkpoint them before flagging a version.", {
      dirty: true,
    });
  }

  const snapshot = await snapshotAt(project, sha);
  const paths = Object.keys(snapshot.files).sort();
  if (paths.length === 0) throw new ApiError(400, "There are no diagrams to flag at this commit.");
  const renderFailures = paths.filter((p) => {
    const { svg, errors } = render(snapshot.files[p]!, "basic");
    return !svg || errors.length > 0;
  });

  const supabase = getServiceSupabase();
  const { data: version, error } = await supabase
    .from("versions")
    .insert({
      project_id: projectId,
      name,
      note: body.note?.trim() || null,
      commit_sha: sha,
      branch: INTEGRATION_BRANCH,
      created_by: project.user.id,
      created_by_login: project.login,
    })
    .select("id")
    .single();
  if (error || !version) throw new ApiError(500, `version insert failed: ${error?.message}`);
  const versionId = version.id as string;

  const { error: filesErr } = await supabase.from("version_files").insert(
    paths.map((p, i) => ({
      version_id: versionId,
      filepath: p,
      dsl_text: snapshot.files[p]!,
      sort_order: i,
    })),
  );
  if (filesErr) {
    await supabase.from("versions").delete().eq("id", versionId);
    throw new ApiError(500, `version files insert failed: ${filesErr.message}`);
  }

  // A tag is a courtesy for people reading the repository on GitHub; a
  // collision (same name twice) must not fail the flag.
  let tag: string | null = `v-${slugify(name)}-${versionId.slice(0, 8)}`;
  try {
    await project.write.createTag(tag, sha);
  } catch (err) {
    if (err instanceof GitHubConflictError) {
      tag = null;
    } else {
      throw err;
    }
  }
  if (tag) await supabase.from("versions").update({ tag_name: tag }).eq("id", versionId);

  await audit({
    workspaceId: project.project.workspaceId,
    projectId,
    userId: project.user.id,
    actorLogin: project.login,
    action: "version.flagged",
    entityType: "version",
    entityId: versionId,
    commitSha: sha,
  });
  return json({ versionId, tag, files: paths.length, renderFailures }, 201);
});

/** GET — versions of the project, newest first (also part of /state). */
export const GET = withApi(async (_req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  await requireProjectRole(projectId, "viewer");
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("versions")
    .select(
      "id, name, note, commit_sha, tag_name, promoted_to_main, promoted_sha, public, share_mode, public_slug, created_at, created_by_login",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(500, error.message);
  return json({ versions: data ?? [] });
});
