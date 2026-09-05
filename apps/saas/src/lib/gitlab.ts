/**
 * Per-user GitLab access, for a workspace backed by a self-hosted (or
 * gitlab.com) instance an org registered its own OAuth Application against.
 * Mirrors `github.ts` exactly — same `GitHubApis`/`RepoApis` split, same
 * `withRepo` curry-to-a-bound-ref pattern — so `projects.ts` can dispatch
 * between the two behind one `RepoApis` shape (`./repo-apis`).
 *
 * Token refresh is NOT implemented here yet (see the plan's phase 6):
 * `getGitLabConnection` treats an expired token as "not connected" rather
 * than silently refreshing it, so an org this lands for before phase 6 ships
 * will see occasional re-connect prompts. Acceptable for the phase 4 slice,
 * which is only about wiring the dispatch, not the refresh itself.
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
import { openToken } from "./token-crypto";

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
  token_expires_at: string;
  gitlab_instances: { host: string } | null;
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
      "gitlab_login, gitlab_user_id, gitlab_email, access_token_ciphertext, token_expires_at, gitlab_instances(host)",
    )
    .eq("user_id", userId)
    .eq("instance_id", instanceId)
    .maybeSingle();
  if (error) throw new ApiError(500, `gitlab_connections lookup failed: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as GitLabConnectionRow;
  // The instance row was deleted out from under this connection, or (phase 6)
  // the token has expired and nothing has refreshed it yet — either way,
  // reconnecting is the only path forward right now.
  if (!row.gitlab_instances) return null;
  if (new Date(row.token_expires_at).getTime() <= Date.now()) return null;
  const token = openToken(row.access_token_ciphertext);
  if (!token) return null; // rotated TOKEN_ENCRYPTION_KEY — reconnecting will re-seal it
  return {
    login: row.gitlab_login,
    gitlabUserId: Number(row.gitlab_user_id),
    email: row.gitlab_email,
    token,
    instanceId,
    instanceHost: row.gitlab_instances.host,
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
