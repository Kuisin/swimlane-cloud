/**
 * Server-side version operations, extracted from the flag/promote routes so
 * the one-step Publish flow (`publishRelease`) can share the exact same
 * snapshot/tag/merge code instead of re-implementing it.
 *
 *   flagVersion    snapshot a commit on preview into Postgres and tag it
 *   promoteVersion land a flagged commit on main via a short-lived release branch
 *   publishRelease flag + promote in one call, with the version number itself
 *                  as the tag — what "公開する / Publish" in the UI calls
 */
import {
  GitHubConflictError,
  GitHubNotAccessibleError,
  INTEGRATION_BRANCH,
  PROD_BRANCH,
  slugify,
} from "@swimlane-cloud/github-client";
import { ApiError } from "./api";
import { assertSha } from "./guard";
import { audit, type ProjectCtx } from "./projects";
import { render } from "./render";
import { hasPendingDrafts, snapshotAt } from "./repo-files";
import { getServiceSupabase } from "./supabase/server";
import { normalizeVersionName } from "./version-name";

export interface FlagVersionOptions {
  name: string;
  note?: string;
  /** Defaults to the tip of preview; must be reachable from preview otherwise. */
  commitSha?: string;
  /**
   * Exact tag to create (the version number, for `publishRelease`). Omit for
   * the legacy `v-<slug>-<id8>` courtesy tag, whose collisions are silently
   * dropped rather than failing the flag.
   */
  tagName?: string;
}

export interface FlagVersionResult {
  versionId: string;
  sha: string;
  tag: string | null;
  files: number;
  renderFailures: string[];
}

/** Flag a commit on preview as a version: snapshot every diagram into Postgres and tag it. */
export async function flagVersion(
  ctx: ProjectCtx,
  projectId: string,
  opts: FlagVersionOptions,
): Promise<FlagVersionResult> {
  const name = opts.name.trim();
  if (!name) throw new ApiError(400, "name is required");

  const previewSha = await ctx.write.refSha(INTEGRATION_BRANCH);
  let sha = previewSha;
  if (opts.commitSha && opts.commitSha !== previewSha) {
    assertSha(opts.commitSha);
    if (!(await ctx.commits.isAncestor(opts.commitSha, INTEGRATION_BRANCH))) {
      throw new ApiError(
        400,
        `Commit ${opts.commitSha.slice(0, 7)} is not on ${INTEGRATION_BRANCH}.`,
      );
    }
    sha = opts.commitSha;
  }

  if (sha === previewSha && (await hasPendingDrafts(projectId, INTEGRATION_BRANCH))) {
    throw new ApiError(409, "preview has unsaved drafts. Push them before flagging a version.", {
      dirty: true,
    });
  }

  const snapshot = await snapshotAt(ctx, sha);
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
      note: opts.note?.trim() || null,
      commit_sha: sha,
      branch: INTEGRATION_BRANCH,
      created_by: ctx.user.id,
      created_by_login: ctx.login,
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

  let tag: string | null = opts.tagName ?? `v-${slugify(name)}-${versionId.slice(0, 8)}`;
  try {
    await ctx.write.createTag(tag, sha);
  } catch (err) {
    if (!(err instanceof GitHubConflictError)) throw err;
    if (opts.tagName) {
      // The caller picked this exact tag on purpose (the version number
      // itself) — a collision means the name is already taken, a real error,
      // not the "courtesy tag" case below.
      await supabase.from("versions").delete().eq("id", versionId);
      throw new ApiError(409, `Version ${opts.tagName} already exists.`);
    }
    // A tag is a courtesy for people reading the repository on GitHub; a
    // collision (same name twice) must not fail the flag.
    tag = null;
  }
  if (tag) await supabase.from("versions").update({ tag_name: tag }).eq("id", versionId);

  await audit({
    workspaceId: ctx.project.workspaceId,
    projectId,
    userId: ctx.user.id,
    actorLogin: ctx.login,
    action: "version.flagged",
    entityType: "version",
    entityId: versionId,
    commitSha: sha,
  });

  return { versionId, sha, tag, files: paths.length, renderFailures };
}

/** Whether `tag` already exists on the repository. */
export async function tagExists(ctx: ProjectCtx, tag: string): Promise<boolean> {
  try {
    await ctx.rest.request(
      `/repos/${ctx.repo.owner}/${ctx.repo.repo}/git/ref/tags/${encodeURIComponent(tag)}`,
    );
    return true;
  } catch (err) {
    if (err instanceof GitHubNotAccessibleError && err.status === 404) return false;
    throw err;
  }
}

/** Point a branch at a specific commit (the write API's ensureBranch takes a ref, not a sha). */
export async function ensureBranchAtSha(ctx: ProjectCtx, name: string, sha: string): Promise<void> {
  try {
    await ctx.write.refSha(name);
    return;
  } catch {
    /* does not exist yet */
  }
  try {
    await ctx.rest.request(`/repos/${ctx.repo.owner}/${ctx.repo.repo}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${name}`, sha },
    });
  } catch (err) {
    if (!(err instanceof GitHubConflictError)) throw err;
  }
}

export interface PromoteVersionResult {
  prNumber: number | null;
  promotedSha: string;
  alreadyPromoted: boolean;
}

/**
 * Land exactly the flagged commit on main: a short-lived `release-*` branch
 * at that sha, a pull request into main, merge, branch gone. Only flagged
 * versions can reach main; preview itself never merges directly.
 */
export async function promoteVersion(
  ctx: ProjectCtx,
  projectId: string,
  versionId: string,
): Promise<PromoteVersionResult> {
  const supabase = getServiceSupabase();
  const { data: version } = await supabase
    .from("versions")
    .select("id, name, note, commit_sha, promoted_to_main, promoted_sha")
    .eq("id", versionId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!version) throw new ApiError(404, "Version not found");
  if (version.promoted_to_main) {
    return {
      prNumber: null,
      promotedSha: version.promoted_sha as string,
      alreadyPromoted: true,
    };
  }

  const sha = version.commit_sha as string;
  const release = `release-${versionId.slice(0, 8)}`;
  await ensureBranchAtSha(ctx, release, sha);

  let prNumber: number | null = null;
  let promotedSha: string;
  try {
    const pr = await ctx.pulls.createPullRequest({
      head: release,
      base: PROD_BRANCH,
      title: `Promote ${version.name}`,
      body: (version.note as string | null) ?? `Version ${version.name} (${sha.slice(0, 7)})`,
    });
    prNumber = pr.number;
    const merged = await ctx.pulls.mergePullRequest(pr.number, {
      method: "merge",
      title: `Promote ${version.name} to ${PROD_BRANCH}`,
    });
    promotedSha = merged.sha;
  } catch (err) {
    // GitHub refuses a PR with nothing to merge: main already contains it.
    if (err instanceof GitHubConflictError && /No commits between/i.test(err.message)) {
      promotedSha = sha;
    } else {
      await ctx.repos.deleteBranch(ctx.repo.owner, ctx.repo.repo, release);
      throw err;
    }
  }
  await ctx.repos.deleteBranch(ctx.repo.owner, ctx.repo.repo, release);

  await supabase
    .from("versions")
    .update({ promoted_to_main: true, promoted_sha: promotedSha })
    .eq("id", versionId);
  if (prNumber !== null) {
    await supabase.from("merge_requests").upsert(
      {
        project_id: projectId,
        pr_number: prNumber,
        head_branch: release,
        base_branch: PROD_BRANCH,
        version_id: versionId,
        title: `Promote ${version.name}`,
        status: "merged",
        author_id: ctx.user.id,
        author_login: ctx.login,
        merged_by_login: ctx.login,
        closed_at: new Date().toISOString(),
      },
      { onConflict: "project_id,pr_number" },
    );
  }
  await audit({
    workspaceId: ctx.project.workspaceId,
    projectId,
    userId: ctx.user.id,
    actorLogin: ctx.login,
    action: "version.promoted",
    entityType: "version",
    entityId: versionId,
    commitSha: promotedSha,
  });

  return { prNumber, promotedSha, alreadyPromoted: false };
}

export interface PublishReleaseResult {
  versionId: string;
  tag: string;
  prNumber: number | null;
  promotedSha: string;
  renderFailures: string[];
}

/**
 * 公開する / Publish: flag preview as `name` (a semver, becomes the tag
 * itself) and immediately promote it to main, in one request. Rejects a
 * version name that has already been used, before touching GitHub.
 */
export async function publishRelease(
  ctx: ProjectCtx,
  projectId: string,
  opts: { name: string; note?: string },
): Promise<PublishReleaseResult> {
  const tagName = normalizeVersionName(opts.name);
  if (!tagName) throw new ApiError(400, "Use the form v1.2.3.");

  const supabase = getServiceSupabase();
  const { data: existing } = await supabase
    .from("versions")
    .select("id")
    .eq("project_id", projectId)
    .eq("name", tagName)
    .maybeSingle();
  if (existing) throw new ApiError(409, `Version ${tagName} already exists.`);
  if (await tagExists(ctx, tagName)) throw new ApiError(409, `Version ${tagName} already exists.`);

  const flagged = await flagVersion(ctx, projectId, { name: tagName, note: opts.note, tagName });
  const promoted = await promoteVersion(ctx, projectId, flagged.versionId);

  return {
    versionId: flagged.versionId,
    tag: flagged.tag ?? tagName,
    prNumber: promoted.prNumber,
    promotedSha: promoted.promotedSha,
    renderFailures: flagged.renderFailures,
  };
}
