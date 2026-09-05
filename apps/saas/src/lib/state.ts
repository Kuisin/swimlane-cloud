/**
 * The one read contract every project tab is built on. Assembled from GitHub
 * (branches, tips, pull requests) and Postgres (drafts, edit sessions,
 * versions) in parallel; the shape is `ProjectState` in types.ts.
 */
import { isIntegrationBranch, isProdBranch, isTmpBranch } from "@swimlane-cloud/github-client";
import { branchLockReason, type ProjectCtx } from "./projects";
import { mapLimit, readConfigAt } from "./repo-files";
import { getServiceSupabase } from "./supabase/server";
import type { BranchKind, BranchState, ProjectState, PullState, VersionState } from "./types";

const BRANCH_CAP = 100;
const PULL_CAP = 50;

function kindOf(name: string): BranchKind {
  if (isProdBranch(name)) return "main";
  if (isIntegrationBranch(name)) return "test";
  if (isTmpBranch(name)) return "tmp";
  if (name.startsWith("release-")) return "release";
  return "other";
}

const KIND_ORDER: Record<BranchKind, number> = { main: 0, test: 1, tmp: 2, release: 3, other: 4 };

export async function buildProjectState(ctx: ProjectCtx): Promise<ProjectState> {
  const supabase = getServiceSupabase();
  const projectId = ctx.project.id;

  const [branches, pulls, config, draftRows, sessionRows, versionRows, mrRows] = await Promise.all([
    ctx.repos.listBranches(ctx.repo.owner, ctx.repo.repo),
    ctx.pulls.listPullRequests({ state: "all" }),
    readConfigAt(ctx, ctx.repoInfo.defaultBranch),
    supabase.from("drafts").select("branch").eq("project_id", projectId),
    supabase
      .from("edit_sessions")
      .select("id, branch_name, created_by_login, created_at")
      .eq("project_id", projectId)
      .eq("status", "active"),
    supabase
      .from("versions")
      .select(
        "id, name, note, commit_sha, tag_name, promoted_to_main, promoted_sha, public, share_mode, public_slug, created_at, created_by_login, version_files(filepath, sort_order)",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("merge_requests")
      .select("pr_number, version_id")
      .eq("project_id", projectId)
      .not("version_id", "is", null),
  ]);

  const dirtyBranches = new Set((draftRows.data ?? []).map((r) => r.branch as string));
  const sessions = new Map(
    (sessionRows.data ?? []).map((s) => [
      s.branch_name as string,
      {
        id: s.id as string,
        createdBy: (s.created_by_login as string | null) ?? null,
        createdAt: s.created_at as string,
      },
    ]),
  );
  const versionByPr = new Map(
    (mrRows.data ?? []).map((m) => [Number(m.pr_number), m.version_id as string]),
  );

  const openPrByHead = new Map<string, number>();
  for (const p of pulls) if (p.state === "open") openPrByHead.set(p.head, p.number);
  const locked = new Set([...openPrByHead.keys()].filter(isTmpBranch));

  const listed = branches.slice(0, BRANCH_CAP);
  const tips = await mapLimit(listed, 8, async (b) => {
    try {
      const [c] = await ctx.commits.listCommits(b.sha, { perPage: 1 });
      return c ?? null;
    } catch {
      return null;
    }
  });

  const branchStates: BranchState[] = listed.map((b, i) => {
    const tip = tips[i];
    const reason = branchLockReason(b.name, ctx.role, locked);
    return {
      name: b.name,
      kind: kindOf(b.name),
      sha: b.sha,
      message: tip?.message.split("\n")[0] ?? "",
      author: tip?.author.login ?? tip?.author.name ?? null,
      date: tip?.author.date ?? "",
      locked: locked.has(b.name),
      openPrNumber: openPrByHead.get(b.name) ?? null,
      dirty: dirtyBranches.has(b.name),
      editable: reason === null,
      lockReason: reason,
      editSession: sessions.get(b.name) ?? null,
    };
  });
  branchStates.sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name),
  );

  const pullStates: PullState[] = pulls.slice(0, PULL_CAP).map((p) => ({
    number: p.number,
    title: p.title,
    head: p.head,
    base: p.base,
    headSha: p.headSha,
    baseSha: p.baseSha,
    state: p.state,
    merged: p.merged,
    author: p.author,
    htmlUrl: p.htmlUrl,
    createdAt: p.createdAt,
    mergedAt: p.mergedAt,
    closedAt: p.closedAt,
    commentCount: p.commentCount,
    versionId: versionByPr.get(p.number) ?? null,
  }));

  const versions: VersionState[] = (versionRows.data ?? []).map((v) => {
    const files = (
      (v as { version_files?: { filepath: string; sort_order: number }[] }).version_files ?? []
    )
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.filepath.localeCompare(b.filepath));
    return {
      id: v.id as string,
      name: v.name as string,
      note: (v.note as string | null) ?? null,
      commitSha: v.commit_sha as string,
      tag: (v.tag_name as string | null) ?? null,
      promoted: Boolean(v.promoted_to_main),
      promotedSha: (v.promoted_sha as string | null) ?? null,
      public: Boolean(v.public),
      shareMode: (v.share_mode as VersionState["shareMode"]) ?? null,
      publicSlug: (v.public_slug as string | null) ?? null,
      createdAt: v.created_at as string,
      createdBy: (v.created_by_login as string | null) ?? null,
      files: files.map((f) => ({ path: f.filepath })),
    };
  });

  const branchNames = new Set(branchStates.map((b) => b.name));
  const mine = (sessionRows.data ?? [])
    .filter((s) => s.created_by_login === ctx.login && branchNames.has(s.branch_name as string))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];

  return {
    project: {
      id: projectId,
      name: config.title ?? ctx.project.name,
      owner: ctx.repo.owner,
      repo: ctx.repo.repo,
      htmlUrl: ctx.repoInfo.htmlUrl,
      diagramsRoot: config.diagramsRoot,
    },
    me: { githubLogin: ctx.login, role: ctx.role, canPush: ctx.repoInfo.permissions.push },
    branches: branchStates,
    pulls: pullStates,
    versions,
    activeEdit: mine
      ? {
          id: mine.id as string,
          branch: mine.branch_name as string,
          createdAt: mine.created_at as string,
        }
      : null,
    plan: ctx.project.plan,
    fetchedAt: new Date().toISOString(),
  };
}
