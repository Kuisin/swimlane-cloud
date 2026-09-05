/**
 * Per-user GitHub access.
 *
 * There is no bot account. Every GitHub call the SaaS makes runs with the
 * token of the person who asked, read from `github_connections` and decrypted
 * here — so GitHub's own permissions are the authorisation model, and the
 * audit trail on github.com shows the real author. Mirrors
 * `apps/hub/src/lib/api.ts` `requireRepoApis`, with the token store swapped
 * from a cookie to Postgres.
 */
import {
  createCommitsApi,
  createPullsApi,
  createReposApi,
  createRestClient,
  createWriteApi,
  type CommitsApi,
  type FetchImpl,
  type PullsApi,
  type RepoRef,
  type ReposApi,
  type RestClient,
  type WriteApi,
} from "@swimlane-cloud/github-client";
import { ApiError } from "./api";
import { getServiceSupabase } from "./supabase/server";
import { openToken } from "./token-crypto";

export interface GitHubConnection {
  login: string;
  githubUserId: number;
  token: string;
}

export interface GitHubApis {
  rest: RestClient;
  repos: ReposApi;
  login: string;
}

export interface RepoApis extends GitHubApis {
  write: WriteApi;
  pulls: PullsApi;
  commits: CommitsApi;
  repo: RepoRef;
}

/**
 * Every response is scoped to one user's permissions, so nothing may enter
 * Next's shared data cache. The 5,000/hr per-token budget is ample without it.
 */
const privateFetch: FetchImpl = (url, init) => {
  const clean: RequestInit = { ...init };
  delete (clean as { immutable?: boolean }).immutable;
  return fetch(url, { ...clean, cache: "no-store" });
};

/** Endpoint override for GitHub Enterprise Server or a local test double. */
function apiOrigin(): string | undefined {
  return process.env.GITHUB_API_ORIGIN || undefined;
}

/** The stored connection for a Supabase user, or null when they never signed in with GitHub here. */
export async function getGitHubConnection(userId: string): Promise<GitHubConnection | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("github_connections")
    .select("github_login, github_user_id, token_ciphertext")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new ApiError(500, `github_connections lookup failed: ${error.message}`);
  if (!data) return null;
  const token = openToken(data.token_ciphertext as string);
  if (!token) return null; // rotated TOKEN_ENCRYPTION_KEY — re-auth will re-seal it
  return {
    login: data.github_login as string,
    githubUserId: Number(data.github_user_id),
    token,
  };
}

export function createGitHubApis(connection: GitHubConnection): GitHubApis {
  const origin = apiOrigin();
  const rest = createRestClient({
    getToken: () => connection.token,
    fetchImpl: privateFetch,
    ...(origin ? { origin } : {}),
  });
  return { rest, repos: createReposApi(rest), login: connection.login };
}

export function withRepo(apis: GitHubApis, repo: RepoRef): RepoApis {
  return {
    ...apis,
    repo,
    write: createWriteApi(apis.rest, repo),
    pulls: createPullsApi(apis.rest, repo),
    commits: createCommitsApi(apis.rest, repo),
  };
}

/** GitHub clients for a user, or 401 `{needsAuth:true}` when no token is on file. */
export async function requireGitHubApis(userId: string): Promise<GitHubApis> {
  const connection = await getGitHubConnection(userId);
  if (!connection) {
    throw new ApiError(401, "GitHub is not connected. Sign in with GitHub again.", {
      needsAuth: true,
    });
  }
  return createGitHubApis(connection);
}

export async function requireRepoApis(userId: string, repo: RepoRef): Promise<RepoApis> {
  return withRepo(await requireGitHubApis(userId), repo);
}
