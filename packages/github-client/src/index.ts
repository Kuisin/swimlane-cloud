/**
 * @swimlane-cloud/github-client
 *
 * A GitHub client with two hard rules: it never imports Next, and it never
 * acquires a token. Callers inject both the token getter and the `fetch` that
 * carries their caching policy. That is what lets one package serve a Next
 * server (`apps/hub`) and a VS Code extension host (`apps/vscode`) without
 * either one's dependencies leaking into the other's bundle.
 *
 * `apps/saas`'s Gitea client cannot be reused for this: `gitea.ts:11` imports
 * `ApiError` from `./api`, and `api.ts:1` imports `next/server`, so every error
 * path drags Next in — fatal in an extension host.
 */

export * from "./types.ts";
export * from "./errors.ts";
export * from "./branch-model.ts";
export * from "./remote-url.ts";
export * from "./repo-config.ts";
export { lsRefs, parseLsRefs, parseRefLine } from "./refs.ts";
export type { LsRefsOptions, LsRefsResult } from "./refs.ts";
export { rawFile, rawUrl } from "./raw.ts";
export type { RawOptions } from "./raw.ts";
export { createRestClient, nextPageUrl } from "./rest.ts";
export type { RestClient, RestClientOptions, RestRequestOptions } from "./rest.ts";
export { createWriteApi } from "./write.ts";
export type { CommitFilesOptions, CommitResult, FileWrite, WriteApi } from "./write.ts";
export { createPullsApi } from "./pulls.ts";
export type { IssueComment, MergeMethod, PullRequest, PullsApi } from "./pulls.ts";
export { createReposApi } from "./repos.ts";
export type {
  BranchInfo,
  GitHubAccount,
  OrgMembership,
  RepoInfo,
  RepoPermissions,
  ReposApi,
} from "./repos.ts";
export { createCommitsApi } from "./commits.ts";
export type {
  ChangedFile,
  ChangedFileStatus,
  CommitSummary,
  CommitsApi,
  CompareResult,
} from "./commits.ts";

import { GitHubNotAccessibleError } from "./errors.ts";
import { lsRefs } from "./refs.ts";
import { rawFile } from "./raw.ts";
import { createRestClient } from "./rest.ts";
import {
  DEFAULT_REPO_CONFIG,
  parseRepoConfig,
  REPO_CONFIG_PATH,
  type RepoConfig,
} from "./repo-config.ts";
import type {
  EtagStore,
  FetchImpl,
  FileBlob,
  RefEntry,
  RepoReader,
  RepoRef,
  ResolvedRef,
  TokenGetter,
} from "./types.ts";

const SHA_RE = /^[0-9a-f]{40}$/;

export interface RepoReaderOptions {
  fetchImpl?: FetchImpl;
  getToken?: TokenGetter;
  etagStore?: EtagStore;
  signal?: AbortSignal;
  /**
   * Endpoint overrides, for GitHub Enterprise Server or a test double.
   * Default to github.com / raw.githubusercontent.com / api.github.com.
   */
  origins?: { git?: string; raw?: string; api?: string };
}

/** Everything a reader offers, plus the repo config and which strategy ran. */
export interface RepoReaderApi extends RepoReader {
  readonly strategy: "anonymous" | "authenticated";
  listBranches(): Promise<RefEntry[]>;
  readConfig(at: string): Promise<RepoConfig>;
}

interface GitHubContentResponse {
  content?: string;
  encoding?: string;
}

/**
 * Pick a read strategy by whether a token is available.
 *
 * Anonymous → git protocol v2 + the raw CDN. Measured to consume zero REST
 * quota, which matters enormously: unauthenticated REST is 60/hr per source IP,
 * shared across every anonymous visitor of a server, so a single
 * `revalidate: 60` on one ref would exhaust the global budget.
 *
 * Authenticated → plain REST. 5,000/hr per user token is ample, and REST is the
 * only path that works for private repos (the raw CDN takes no credentials).
 */
export async function createRepoReader(
  repo: RepoRef,
  options: RepoReaderOptions = {},
): Promise<RepoReaderApi> {
  const { fetchImpl, getToken, etagStore, signal, origins } = options;
  const token = getToken ? await getToken() : null;
  return token
    ? authenticatedReader(repo, token, { fetchImpl, getToken, etagStore, signal, origins })
    : anonymousReader(repo, { fetchImpl, signal, origins });
}

function anonymousReader(
  repo: RepoRef,
  opts: { fetchImpl?: FetchImpl; signal?: AbortSignal; origins?: RepoReaderOptions["origins"] },
): RepoReaderApi {
  const refsOpts = { ...opts, ...(opts.origins?.git ? { origin: opts.origins.git } : {}) };
  const rawOpts = { ...opts, ...(opts.origins?.raw ? { origin: opts.origins.raw } : {}) };
  // One ls-refs round trip answers default branch, branches and tags, so cache
  // it for the life of the reader rather than paying for it three times.
  let refsPromise: ReturnType<typeof lsRefs> | null = null;
  const allRefs = () => (refsPromise ??= lsRefs(repo, refsOpts));

  async function resolveRef(ref: string): Promise<ResolvedRef> {
    if (SHA_RE.test(ref)) return { sha: ref, kind: "sha", name: ref };

    const { refs, defaultBranch, headSha } = await allRefs();
    if (ref === "HEAD" && headSha) {
      return { sha: headSha, kind: "branch", name: defaultBranch ?? "HEAD" };
    }
    const branch = refs.find((r) => r.ref === `refs/heads/${ref}`);
    if (branch) return { sha: branch.sha, kind: "branch", name: ref };

    const tag = refs.find((r) => r.ref === `refs/tags/${ref}`);
    // An annotated tag points at a tag object, not a commit; `peeled` is the
    // commit, and only a commit sha can be read as a tree.
    if (tag) return { sha: tag.peeled ?? tag.sha, kind: "tag", name: ref };

    throw new GitHubNotAccessibleError(`Ref "${ref}" not found in ${repo.owner}/${repo.repo}.`);
  }

  return {
    strategy: "anonymous",

    async defaultBranch() {
      const { defaultBranch } = await allRefs();
      if (!defaultBranch) {
        throw new GitHubNotAccessibleError(
          `${repo.owner}/${repo.repo} advertised no default branch.`,
        );
      }
      return defaultBranch;
    },

    resolveRef,

    async readFile(path, at) {
      return rawFile(repo, at, path, rawOpts);
    },

    async listTags() {
      const { refs } = await allRefs();
      return refs.filter((r) => r.ref.startsWith("refs/tags/"));
    },

    async listBranches() {
      const { refs } = await allRefs();
      return refs.filter((r) => r.ref.startsWith("refs/heads/"));
    },

    async readConfig(at) {
      const blob = await rawFile(repo, at, REPO_CONFIG_PATH, rawOpts);
      return parseRepoConfig(blob?.text ?? null);
    },
  };
}

function authenticatedReader(
  repo: RepoRef,
  _token: string,
  opts: {
    fetchImpl?: FetchImpl;
    getToken?: TokenGetter;
    etagStore?: EtagStore;
    signal?: AbortSignal;
    origins?: RepoReaderOptions["origins"];
  },
): RepoReaderApi {
  const rest = createRestClient({
    fetchImpl: opts.fetchImpl,
    ...(opts.getToken ? { getToken: opts.getToken } : {}),
    ...(opts.etagStore ? { etagStore: opts.etagStore } : {}),
    ...(opts.origins?.api ? { origin: opts.origins.api } : {}),
  });
  const base = `/repos/${repo.owner}/${repo.repo}`;
  const sig = opts.signal ? { signal: opts.signal } : {};

  async function readFile(path: string, at: string): Promise<FileBlob | null> {
    const url = `${base}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(at)}`;
    try {
      // `application/vnd.github.raw` returns the bytes directly. The default
      // base64-JSON form refuses anything over 1 MB.
      const text = await rest.requestText(url, {
        accept: "application/vnd.github.raw",
        immutable: SHA_RE.test(at),
        ...sig,
      });
      return { text, at, path };
    } catch (err) {
      if (err instanceof GitHubNotAccessibleError && err.status === 404) return null;
      throw err;
    }
  }

  return {
    strategy: "authenticated",

    async defaultBranch() {
      const repoData = await rest.request<{ default_branch: string }>(base, sig);
      return repoData.default_branch;
    },

    async resolveRef(ref) {
      if (SHA_RE.test(ref)) return { sha: ref, kind: "sha", name: ref };
      const matches = await rest.request<
        | { ref: string; object: { sha: string; type: string } }[]
        | { ref: string; object: { sha: string; type: string } }
      >(`${base}/git/matching-refs/heads/${encodeURIComponent(ref)}`, sig);
      const heads = Array.isArray(matches) ? matches : [matches];
      const head = heads.find((r) => r.ref === `refs/heads/${ref}`);
      if (head) return { sha: head.object.sha, kind: "branch", name: ref };

      const tagMatches = await rest.request<
        { ref: string; object: { sha: string; type: string } }[]
      >(`${base}/git/matching-refs/tags/${encodeURIComponent(ref)}`, sig);
      const tag = (Array.isArray(tagMatches) ? tagMatches : [tagMatches]).find(
        (r) => r.ref === `refs/tags/${ref}`,
      );
      if (tag) {
        if (tag.object.type === "tag") {
          const obj = await rest.request<{ object: { sha: string } }>(
            `${base}/git/tags/${tag.object.sha}`,
            { immutable: true, ...sig },
          );
          return { sha: obj.object.sha, kind: "tag", name: ref };
        }
        return { sha: tag.object.sha, kind: "tag", name: ref };
      }
      throw new GitHubNotAccessibleError(`Ref "${ref}" not found in ${repo.owner}/${repo.repo}.`);
    },

    readFile,

    async listTags() {
      const refs = await rest.paginate<{ ref: string; object: { sha: string; type: string } }>(
        `${base}/git/matching-refs/tags/`,
        sig,
      );
      return refs.map((r) => ({
        ref: r.ref,
        name: r.ref.replace("refs/tags/", ""),
        sha: r.object.sha,
      }));
    },

    async listBranches() {
      const refs = await rest.paginate<{ ref: string; object: { sha: string } }>(
        `${base}/git/matching-refs/heads/`,
        sig,
      );
      return refs.map((r) => ({
        ref: r.ref,
        name: r.ref.replace("refs/heads/", ""),
        sha: r.object.sha,
      }));
    },

    async readConfig(at) {
      const blob = await readFile(REPO_CONFIG_PATH, at);
      return blob ? parseRepoConfig(blob.text) : { ...DEFAULT_REPO_CONFIG };
    },
  };
}
