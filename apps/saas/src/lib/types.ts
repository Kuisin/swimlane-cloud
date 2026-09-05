/**
 * Wire types shared by the API routes and the browser. Nothing here imports
 * a server module, so `workflow.ts` and the pages can use these directly.
 */

export type Role = "owner" | "editor" | "viewer";
export type BranchKind = "main" | "preview" | "edit" | "release" | "other";
export type LockReason = "main" | "locked" | "previewOwnerOnly" | "viewer" | "other";
export type ShareMode = "svg_only" | "svg_and_dsl";

export interface BranchState {
  name: string;
  kind: BranchKind;
  sha: string;
  message: string;
  author: string | null;
  date: string;
  /** An edit branch with an open pull request is frozen. */
  locked: boolean;
  openPrNumber: number | null;
  /** Uncommitted drafts exist for this branch. */
  dirty: boolean;
  /** Whether the caller may write to it. */
  editable: boolean;
  lockReason: LockReason | null;
  editSession: { id: string; createdBy: string | null; createdAt: string } | null;
}

export interface PullState {
  number: number;
  title: string;
  head: string;
  base: string;
  headSha: string;
  baseSha: string;
  state: "open" | "closed";
  merged: boolean;
  author: string;
  htmlUrl: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  commentCount: number;
  versionId: string | null;
}

export interface VersionState {
  id: string;
  name: string;
  note: string | null;
  commitSha: string;
  tag: string | null;
  promoted: boolean;
  promotedSha: string | null;
  public: boolean;
  shareMode: ShareMode | null;
  publicSlug: string | null;
  createdAt: string;
  createdBy: string | null;
  files: { path: string }[];
}

export interface ProjectState {
  project: {
    id: string;
    name: string;
    owner: string;
    repo: string;
    htmlUrl: string;
    diagramsRoot: string;
  };
  me: { githubLogin: string; role: Role; canPush: boolean };
  branches: BranchState[];
  pulls: PullState[];
  versions: VersionState[];
  activeEdit: { id: string; branch: string; createdAt: string } | null;
  plan: "free" | "team" | "enterprise";
  fetchedAt: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  login: string | null;
  date: string;
  htmlUrl: string;
  parents: string[];
}

export interface TreeResponse {
  ref: string;
  sha: string;
  files: { id: string; name: string }[];
  truncated: boolean;
  diagramsRoot: string;
}

export interface SnapshotResponse {
  sha: string;
  files: Record<string, string>;
}

export interface CompareFile {
  path: string;
  status: "added" | "removed" | "changed" | "renamed";
  before: string | null;
  after: string | null;
}

export interface CompareResponse {
  status: "identical" | "ahead" | "behind" | "diverged";
  aheadBy: number;
  behindBy: number;
  mergeBaseSha: string;
  files: CompareFile[];
}

export interface PullComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  htmlUrl: string;
}

export interface PullDetail {
  pull: PullState;
  comments: PullComment[];
  files: CompareFile[];
}
