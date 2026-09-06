/**
 * The provider-agnostic shape every project route is written against.
 *
 * `requireProjectRole` (in `projects.ts`) is the one place that knows whether
 * a project is backed by GitHub or GitLab; everything downstream — `state.ts`,
 * `versions.ts`, every `app/api/projects/[projectId]/*` route — only ever
 * calls these methods, never a provider-specific one. `github.ts`'s `withRepo`
 * and `gitlab.ts`'s `withGitLabRepo` each produce an object satisfying this
 * shape; TypeScript checks that structurally, not through a shared base class.
 *
 * A few methods below (`write.createTag`, `commits.isAncestor`, every method
 * on `pulls` except `listPullRequests`) are only ever *called* from routes
 * gated behind an explicit `provider !== "github"` check — but because every
 * route shares this one `ProjectCtx` type, GitLab's implementation still has
 * to provide them, as stubs that throw `GitLabNotImplementedError`. That
 * throw should be unreachable in practice; it exists so the type system
 * doesn't have to know about the runtime guard.
 */
import type {
  BranchInfo,
  ChangedFile,
  CommitFilesOptions,
  CommitSummary,
  IssueComment,
  PullRequest,
  RepoInfo,
  TreeEntry,
} from "@swimlane-cloud/github-client";

export type { BranchInfo, ChangedFile, CommitSummary, IssueComment, PullRequest, RepoInfo };

/** Bound to one project at construction; no `(owner, repo)` pair on every call. */
export interface ReposApi {
  getRepo(): Promise<RepoInfo>;
  listBranches(): Promise<BranchInfo[]>;
  addTopic(topic: string): Promise<string[]>;
  deleteBranch(name: string): Promise<void>;
}

export interface CommitResult {
  sha: string;
  branch: string;
}

export interface WriteApi {
  refSha(ref: string): Promise<string>;
  ensureBranch(name: string, fromRef: string): Promise<void>;
  commitFiles(options: CommitFilesOptions): Promise<CommitResult>;
  putFile(path: string, text: string, branch: string, message: string): Promise<string>;
  /** Text of a file at a ref, or null when it does not exist there. */
  readFile(path: string, ref: string): Promise<string | null>;
  /** The same file as base64, for an imported image. GitHub-only in practice. */
  readFileBase64?(path: string, ref: string): Promise<string | null>;
  listTree(sha: string, recursive?: boolean): Promise<{ entries: TreeEntry[]; truncated: boolean }>;
  /** Point a new branch at an exact sha rather than another ref's tip. */
  createBranchAtSha(name: string, sha: string): Promise<void>;
  tagExists(tag: string): Promise<boolean>;
  /** GitHub-only in practice — see the module comment. */
  createTag(tag: string, sha: string): Promise<void>;
}

export interface PullsApi {
  /** The one method called outside the GitHub-only review flow — see `state.ts`. */
  listPullRequests(opts?: {
    state?: "open" | "closed" | "all";
    head?: string;
    base?: string;
  }): Promise<PullRequest[]>;
  createPullRequest(opts: {
    head: string;
    base: string;
    title: string;
    body?: string;
    draft?: boolean;
  }): Promise<PullRequest>;
  getPullRequest(number: number): Promise<PullRequest>;
  closePullRequest(number: number): Promise<PullRequest>;
  listIssueComments(number: number): Promise<IssueComment[]>;
  createIssueComment(number: number, body: string): Promise<IssueComment>;
  mergePullRequest(
    number: number,
    opts?: { method?: "merge" | "squash" | "rebase"; title?: string; expectedHeadSha?: string },
  ): Promise<{ sha: string; merged: boolean }>;
}

export interface CommitsApi {
  listCommits(ref: string, opts?: { perPage?: number; page?: number }): Promise<CommitSummary[]>;
  compare(
    from: string,
    to: string,
  ): Promise<{
    status: "identical" | "ahead" | "behind" | "diverged";
    aheadBy: number;
    behindBy: number;
    mergeBaseSha: string;
    files: ChangedFile[];
    commits: CommitSummary[];
  }>;
  /** GitHub-only in practice — see the module comment. */
  isAncestor(sha: string, ref: string): Promise<boolean>;
}

export interface RepoApis {
  repos: ReposApi;
  write: WriteApi;
  pulls: PullsApi;
  commits: CommitsApi;
  login: string;
  /** Real for GitLab (fetched from the connected account); a noreply template for GitHub. */
  commitAuthorEmail: string;
}
