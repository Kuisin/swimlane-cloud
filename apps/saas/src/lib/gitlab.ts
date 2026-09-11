/**
 * Per-user GitLab access, for a workspace backed by a self-hosted (or
 * gitlab.com) instance an org registered its own OAuth Application against.
 * Mirrors `github.ts` exactly — same `GitHubApis`/`RepoApis` split, same
 * `withRepo` curry-to-a-bound-ref pattern — so `projects.ts` can dispatch
 * between the two behind one `RepoApis` shape (`./repo-apis`).
 *
 * Unlike GitHub's, a GitLab OAuth access token expires (~2h) and carries a
 * refresh token. `getGitLabConnection` is the one place that knows this:
 * every caller of `requireGitLabApis` gets a live token transparently, with
 * the refreshed pair re-sealed and stored before it returns.
 */
import {
  createCommitsApi,
  createMergeRequestsApi,
  createProjectsApi,
  createRestClient,
  createWriteApi,
  type FetchImpl,
  type ReposApi as UnboundGitLabReposApi,
  type RestClient,
} from "@swimlane-cloud/gitlab-client";
import { ApiError } from "./api";
import type { ReposApi, RepoApis as SharedRepoApis } from "./repo-apis";
import { getServiceSupabase } from "./supabase/server";
import { openToken, sealToken } from "./token-crypto";

/** Refresh once the access token has under a minute left, not exactly at expiry. */
const REFRESH_SKEW_MS = 60_000;

export interface GitLabConnection {
  login: string;
  gitlabUserId: number;
  email: string;
  token: string;
  instanceId: string;
  instanceHost: string;
}

/** Before a project exists: `repos` is gitlab-client's raw, unbound `(projectId)` API. */
export interface GitLabApis {
  rest: RestClient;
  repos: UnboundGitLabReposApi;
  login: string;
  commitAuthorEmail: string;
}

/** Once a project exists: `repos` here is bound to it, matching `./repo-apis`'s shared shape. */
export interface RepoApis extends SharedRepoApis {
  rest: RestClient;
  projectId: number;
}

/** Curries gitlab-client's unbound `(projectId)` methods to one project. */
function boundReposApi(repos: UnboundGitLabReposApi, projectId: number): ReposApi {
  return {
    getRepo: () => repos.getRepo(projectId),
    listBranches: () => repos.listBranches(projectId),
    addTopic: (topic: string) => repos.addTopic(projectId, topic),
    deleteBranch: (name: string) => repos.deleteBranch(projectId, name),
  };
}

/** Same no-shared-cache rule as `github.ts`: every response is scoped to one user's permissions. */
const privateFetch: FetchImpl = (url, init) => {
  const clean: RequestInit = { ...init };
  delete (clean as { immutable?: boolean }).immutable;
  return fetch(url, { ...clean, cache: "no-store" });
};

interface GitLabConnectionRow {
  gitlab_login: string;
  gitlab_user_id: number;
  gitlab_email: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  token_expires_at: string;
  gitlab_instances: { host: string; client_id: string; client_secret_ciphertext: string } | null;
}

interface RefreshTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * POSTs the refresh grant and re-seals the result. Two concurrent requests
 * racing an expiring token both refresh and both write their own valid pair
 * — GitLab may invalidate the loser's specific access token on rotation, but
 * each writer's own row update still leaves a usable pair on file, so this
 * is a wasted extra request under contention, not a correctness bug. Not
 * worth a distributed lock for a single-user session.
 */
async function refreshAccessToken(
  userId: string,
  instanceId: string,
  instance: { host: string; clientId: string; clientSecret: string },
  refreshTokenCiphertext: string,
): Promise<string | null> {
  const refreshToken = openToken(refreshTokenCiphertext);
  if (!refreshToken) return null;

  const res = await fetch(`${instance.host}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: instance.clientId,
      client_secret: instance.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });
  const payload = (await res.json().catch(() => null)) as RefreshTokenResponse | null;
  if (!payload?.access_token) return null;

  const supabase = getServiceSupabase();
  await supabase
    .from("gitlab_connections")
    .update({
      access_token_ciphertext: sealToken(payload.access_token),
      refresh_token_ciphertext: sealToken(payload.refresh_token ?? refreshToken),
      token_expires_at: new Date(Date.now() + (payload.expires_in ?? 7200) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("instance_id", instanceId);
  return payload.access_token;
}

/** The stored connection for a user against one instance, or null when there isn't a live one. */
export async function getGitLabConnection(
  userId: string,
  instanceId: string,
): Promise<GitLabConnection | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("gitlab_connections")
    .select(
      "gitlab_login, gitlab_user_id, gitlab_email, access_token_ciphertext, refresh_token_ciphertext, " +
        "token_expires_at, gitlab_instances(host, client_id, client_secret_ciphertext)",
    )
    .eq("user_id", userId)
    .eq("instance_id", instanceId)
    .maybeSingle();
  if (error) throw new ApiError(500, `gitlab_connections lookup failed: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as GitLabConnectionRow;
  if (!row.gitlab_instances) return null; // the instance row was deleted out from under this connection

  const clientSecret = openToken(row.gitlab_instances.client_secret_ciphertext);
  if (!clientSecret) return null; // rotated TOKEN_ENCRYPTION_KEY — reconnecting will re-seal it
  const instance = {
    host: row.gitlab_instances.host,
    clientId: row.gitlab_instances.client_id,
    clientSecret,
  };

  const expiresInMs = new Date(row.token_expires_at).getTime() - Date.now();
  const token =
    expiresInMs > REFRESH_SKEW_MS
      ? openToken(row.access_token_ciphertext)
      : await refreshAccessToken(userId, instanceId, instance, row.refresh_token_ciphertext);
  if (!token) return null; // refresh failed, or a rotated TOKEN_ENCRYPTION_KEY — reconnecting fixes both

  return {
    login: row.gitlab_login,
    gitlabUserId: Number(row.gitlab_user_id),
    email: row.gitlab_email,
    token,
    instanceId,
    instanceHost: instance.host,
  };
}

export function createGitLabApis(connection: GitLabConnection): GitLabApis {
  const rest = createRestClient({
    origin: `${connection.instanceHost}/api/v4`,
    getToken: () => connection.token,
    fetchImpl: privateFetch,
  });
  return {
    rest,
    repos: createProjectsApi(rest),
    login: connection.login,
    commitAuthorEmail: connection.email,
  };
}

export function withGitLabRepo(apis: GitLabApis, ref: { projectId: number }): RepoApis {
  return {
    ...apis,
    projectId: ref.projectId,
    repos: boundReposApi(apis.repos, ref.projectId),
    write: createWriteApi(apis.rest, ref.projectId),
    pulls: createMergeRequestsApi(apis.rest, ref.projectId),
    commits: createCommitsApi(apis.rest, ref.projectId),
  };
}

/** GitLab clients for a user against one instance, or 401 `{needsAuth:true, provider:"gitlab"}`. */
export async function requireGitLabApis(userId: string, instanceId: string): Promise<GitLabApis> {
  const connection = await getGitLabConnection(userId, instanceId);
  if (!connection) {
    throw new ApiError(401, "GitLab is not connected. Reconnect your GitLab account.", {
      needsAuth: true,
      provider: "gitlab",
      instanceId,
    });
  }
  return createGitLabApis(connection);
}
