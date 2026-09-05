/**
 * Browser-side client for the project API — one function per route, plus the
 * pure branch-rule helpers the pages use. Replaces the localStorage demo
 * (`demo-workflow.ts`) with the same names where the UX is the same.
 */
import { INTEGRATION_BRANCH, PROD_BRANCH } from "@swimlane-cloud/github-client";
import { api, del, patchJson, postJson } from "./client";
import type {
  BranchState,
  CommitInfo,
  CompareResponse,
  LockReason,
  PendingChange,
  ProjectState,
  PullDetail,
  ShareMode,
  SnapshotResponse,
  TreeResponse,
} from "./types";

export type { ApiClientError } from "./client";

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;
const q = (params: Record<string, string | undefined>) =>
  new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined),
  ).toString();

// ── Reads ────────────────────────────────────────────────────────────────────

export const getState = (pid: string) => api<ProjectState>(`${base(pid)}/state`);

export const getTree = (pid: string, ref: string) =>
  api<TreeResponse>(`${base(pid)}/tree?${q({ ref })}`);

export const getFile = (pid: string, branch: string, path: string) =>
  api<{ dsl: string; source: "draft" | "git" }>(`${base(pid)}/file?${q({ branch, path })}`);

export const getSnapshot = (pid: string, ref: string, withDrafts = false) =>
  api<SnapshotResponse>(
    `${base(pid)}/snapshot?${q({ ref, withDrafts: withDrafts ? "1" : undefined })}`,
  );

export const compare = (pid: string, baseRef: string, head: string) =>
  api<CompareResponse>(`${base(pid)}/compare?${q({ base: baseRef, head })}`);

export const listCommits = (pid: string, branch: string, page = 1, perPage = 30) =>
  api<{ branch: string; commits: CommitInfo[] }>(
    `${base(pid)}/commits?${q({ branch, page: String(page), perPage: String(perPage) })}`,
  );

export const getPR = (pid: string, number: number) =>
  api<PullDetail>(`${base(pid)}/pulls/${number}`);

// ── Drafts & commits ─────────────────────────────────────────────────────────

export const saveDrafts = (pid: string, branch: string, files: { id: string; dsl: string }[]) =>
  postJson<{ saved: number }>(`${base(pid)}/draft`, { branch, files });

export const discardDrafts = (pid: string, branch: string, path?: string) =>
  del<{ deleted: number }>(`${base(pid)}/draft?${q({ branch, path })}`);

export const deleteFile = (pid: string, branch: string, path: string) =>
  postJson<{ removed: number }>(`${base(pid)}/files`, { op: "delete", branch, path });

export const removeFolder = (pid: string, branch: string, dir: string) =>
  postJson<{ removed: number }>(`${base(pid)}/files`, { op: "rmdir", branch, dir });

export const renameFile = (pid: string, branch: string, from: string, to: string) =>
  postJson<{ renamed: boolean; from: string; to: string }>(`${base(pid)}/files`, {
    op: "rename",
    branch,
    from,
    to,
  });

export const checkpoint = (
  pid: string,
  branch: string,
  message?: string,
  files?: { id: string; dsl: string }[],
  expectedHeadSha?: string,
) =>
  postJson<{
    commitSha: string;
    branch: string;
    files: number;
    deleted: number;
    changes: PendingChange[];
    subject: string;
  }>(`${base(pid)}/checkpoint`, {
    branch,
    message,
    files,
    expectedHeadSha,
  });

/** Every uncommitted change on a branch, for the Push / Request-review modals. */
export const listPendingChanges = (pid: string, branch: string) =>
  api<{ headSha: string; changes: PendingChange[] }>(`${base(pid)}/draft?${q({ branch })}`);

// ── Branches & pull requests ────────────────────────────────────────────────

/** Cuts (or reuses) an edit branch named `<login>/<timestamp>/<key>` by the server. */
export const startEdit = (pid: string) =>
  postJson<{ editId: string; branch: string; sha: string; reused: boolean }>(
    `${base(pid)}/edits`,
    {},
  );

export const abandonEdit = (pid: string, editId: string) =>
  del<{ abandoned: boolean; branch?: string }>(`${base(pid)}/edits/${editId}`);

/**
 * Opens (or reuses) the pull request for `head`. The caller is responsible
 * for making sure `head` is fully pushed first — the Request-review modal
 * checks `listPendingChanges` and blocks itself rather than silently
 * committing on the user's behalf.
 */
export const openPR = (pid: string, head: string, title?: string) =>
  postJson<{ number: number; htmlUrl: string; base: string; reused: boolean }>(
    `${base(pid)}/pulls`,
    { head, title },
  );

export const mergePR = (pid: string, number: number, expectedHeadSha?: string) =>
  postJson<{ sha: string; merged: boolean; deletedBranch: string | null }>(
    `${base(pid)}/pulls/${number}/merge`,
    { expectedHeadSha },
  );

export const closePR = (pid: string, number: number) =>
  postJson<{ closed: boolean }>(`${base(pid)}/pulls/${number}/close`, {});

export const addPRComment = (pid: string, number: number, body: string) =>
  postJson<{ comment: PullDetail["comments"][number] }>(`${base(pid)}/pulls/${number}/comments`, {
    body,
  });

// ── Versions ────────────────────────────────────────────────────────────────

export const flagVersion = (pid: string, name: string, note?: string, commitSha?: string) =>
  postJson<{ versionId: string; tag: string | null; files: number; renderFailures: string[] }>(
    `${base(pid)}/versions`,
    { name, note, commitSha },
  );

export const promoteVersion = (pid: string, versionId: string) =>
  postJson<{ versionId: string; prNumber: number | null; promotedSha: string }>(
    `${base(pid)}/versions/${versionId}/promote`,
    {},
  );

/** 公開する / Publish: flag preview as `name` (a semver) and promote it to main in one request. */
export const publishRelease = (pid: string, name: string, note?: string) =>
  postJson<{
    versionId: string;
    tag: string;
    prNumber: number | null;
    promotedSha: string;
    renderFailures: string[];
  }>(`${base(pid)}/versions/publish`, { name, note });

export const publishVersion = (pid: string, versionId: string, shareMode: ShareMode) =>
  patchJson<{ versionId: string; public: boolean; public_slug: string }>(
    `${base(pid)}/versions/${versionId}/public`,
    { public: true, share_mode: shareMode },
  );

export const unpublishVersion = (pid: string, versionId: string) =>
  patchJson<{ versionId: string; public: boolean }>(`${base(pid)}/versions/${versionId}/public`, {
    public: false,
  });

export const versionSvgUrl = (pid: string, versionId: string, path: string) =>
  `${base(pid)}/versions/${versionId}/svg?${q({ path })}`;

// ── Pure helpers over ProjectState ──────────────────────────────────────────

export function branchOf(state: ProjectState, name: string): BranchState | undefined {
  return state.branches.find((b) => b.name === name);
}

export function canEditBranch(state: ProjectState, name: string): boolean {
  return branchOf(state, name)?.editable ?? false;
}

export function isLocked(state: ProjectState, name: string): boolean {
  return branchOf(state, name)?.locked ?? false;
}

export function editLockReason(state: ProjectState, name: string): LockReason | null {
  const b = branchOf(state, name);
  if (!b) return "other";
  return b.lockReason;
}

/**
 * The branch the Edit tab should open: the URL's, else my active edit, else
 * preview (承認済み), else main (公開済み), else whatever the repository has.
 */
export function defaultBranch(state: ProjectState, requested?: string | null): string {
  if (requested && branchOf(state, requested)) return requested;
  if (state.activeEdit && branchOf(state, state.activeEdit.branch)) return state.activeEdit.branch;
  if (branchOf(state, INTEGRATION_BRANCH)) return INTEGRATION_BRANCH;
  if (branchOf(state, PROD_BRANCH)) return PROD_BRANCH;
  return state.branches[0]?.name ?? PROD_BRANCH;
}
