/**
 * Projects, accounts, groups and branches — the discovery and provisioning
 * surface for a GitLab instance.
 *
 * A GitLab project is addressed by numeric id or by URL-encoded
 * `namespace%2Fpath` — both work on every endpoint here. The numeric id is
 * what `apps/saas` stores (`projects.gitlab_project_id`), because it survives
 * a project rename or move between groups, unlike a path string.
 */

import { GitLabConflictError, GitLabNotAccessibleError } from "./errors.ts";
import type { RestClient } from "./rest.ts";

export interface RepoPermissions {
  admin: boolean;
  push: boolean;
  pull: boolean;
}

export interface RepoInfo {
  id: number;
  /** Full namespace path, e.g. `group/subgroup` — GitLab's analogue of a GitHub owner login. */
  owner: string;
  ownerId: number;
  ownerType: "User" | "Organization";
  name: string;
  /** `namespace/path`, GitLab's analogue of `full_name`. */
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  description: string | null;
  topics: string[];
  permissions: RepoPermissions;
  pushedAt: string | null;
}

export interface GitLabAccount {
  login: string;
  id: number;
  type: "User" | "Organization";
  avatarUrl: string;
}

export interface BranchInfo {
  name: string;
  sha: string;
  protected: boolean;
}

/** A group the token's user can create projects in (Owner access level = 50). */
export interface NamespaceMembership {
  id: number;
  path: string;
  fullPath: string;
  name: string;
  accessLevel: number;
}

interface RawProject {
  id: number;
  name: string;
  path_with_namespace: string;
  visibility: string;
  default_branch: string | null;
  web_url: string;
  description: string | null;
  topics?: string[];
  permissions?: {
    project_access?: { access_level: number } | null;
    group_access?: { access_level: number } | null;
  };
  namespace: { id: number; full_path: string; kind: string };
  last_activity_at: string | null;
}

interface RawUser {
  id: number;
  username: string;
  email?: string;
  avatar_url: string;
}

interface RawGroup {
  id: number;
  path: string;
  full_path: string;
  name: string;
}

function accessLevelOf(raw: RawProject): number {
  const perms = raw.permissions;
  return Math.max(perms?.project_access?.access_level ?? 0, perms?.group_access?.access_level ?? 0);
}

function toRepo(raw: RawProject): RepoInfo {
  const level = accessLevelOf(raw);
  const [owner] = splitFullPath(raw.path_with_namespace);
  return {
    id: raw.id,
    owner,
    ownerId: raw.namespace.id,
    ownerType: raw.namespace.kind === "group" ? "Organization" : "User",
    name: raw.name,
    fullName: raw.path_with_namespace,
    private: raw.visibility !== "public",
    // Empty until the first commit lands (mirrors GitHub's brand-new-repo state).
    defaultBranch: raw.default_branch ?? "",
    htmlUrl: raw.web_url,
    description: raw.description ?? null,
    topics: raw.topics ?? [],
    permissions: {
      admin: level >= 40, // Maintainer+ — closest analogue to a GitHub repo admin
      push: level >= 30, // Developer+
      pull: true,
    },
    pushedAt: raw.last_activity_at ?? null,
  };
}

function splitFullPath(pathWithNamespace: string): [namespace: string, name: string] {
  const idx = pathWithNamespace.lastIndexOf("/");
  return idx === -1
    ? ["", pathWithNamespace]
    : [pathWithNamespace.slice(0, idx), pathWithNamespace.slice(idx + 1)];
}

function toAccount(raw: RawUser): GitLabAccount {
  return { login: raw.username, id: raw.id, type: "User", avatarUrl: raw.avatar_url };
}

/** Numeric id or `namespace/path` — both accepted, always URL-encoded when a path. */
function encodeProjectRef(projectId: number | string): string {
  return typeof projectId === "number" ? String(projectId) : encodeURIComponent(projectId);
}

export function createProjectsApi(rest: RestClient) {
  return {
    async getAuthenticatedUser(): Promise<GitLabAccount> {
      return toAccount(await rest.request<RawUser>("/user"));
    },

    async getRepo(projectId: number | string): Promise<RepoInfo> {
      return toRepo(await rest.request<RawProject>(`/projects/${encodeProjectRef(projectId)}`));
    },

    /**
     * Every project the token can see, optionally narrowed to one topic.
     * Sorted by last activity, mirroring the GitHub port's "most active
     * first" ordering.
     */
    async listAccessibleRepos(opts: { topic?: string; max?: number } = {}): Promise<RepoInfo[]> {
      const params = new URLSearchParams({
        membership: "true",
        order_by: "last_activity_at",
        sort: "desc",
        ...(opts.topic ? { topic: opts.topic } : {}),
      });
      const raws = await rest.paginate<RawProject>(`/projects?${params}`, { max: opts.max ?? 30 });
      return raws.map(toRepo);
    },

    /**
     * Every project directly inside one group (not its subgroups —
     * `include_subgroups` stays off since a workspace names exactly one
     * namespace) the token can see, optionally narrowed to one topic. Used
     * for workspace-scoped discovery, where `listAccessibleRepos`'s
     * every-namespace-the-token-can-reach scope would be too broad.
     */
    async listNamespaceProjects(
      namespaceId: number,
      opts: { topic?: string; max?: number } = {},
    ): Promise<RepoInfo[]> {
      const params = new URLSearchParams({
        order_by: "last_activity_at",
        sort: "desc",
        ...(opts.topic ? { topic: opts.topic } : {}),
      });
      const raws = await rest.paginate<RawProject>(`/groups/${namespaceId}/projects?${params}`, {
        max: opts.max ?? 30,
      });
      return raws.map(toRepo);
    },

    /**
     * Groups where the token's user holds Owner access (level 50) — the
     * GitLab analogue of "can spend the org's quota by creating new
     * projects", used only by the instance-claim and project-create flows.
     */
    async listOwnedNamespaces(): Promise<NamespaceMembership[]> {
      const raws = await rest.paginate<RawGroup & { access_level?: number }>(
        `/groups?min_access_level=50&all_available=false`,
      );
      return raws.map((g) => ({
        id: g.id,
        path: g.path,
        fullPath: g.full_path,
        name: g.name,
        accessLevel: 50,
      }));
    },

    /**
     * `initialize_with_readme` is intentionally left false: the seed commit
     * (built via `write.commitFiles`) both creates the default branch and
     * adds the seed files in one request, since GitLab's commit-actions API
     * accepts a `branch` name that does not exist yet on a fully empty
     * project — no separate "auto_init" step is needed the way GitHub's is.
     */
    async createRepo(opts: {
      name: string;
      namespaceId: number;
      description?: string;
    }): Promise<RepoInfo> {
      const raw = await rest.request<RawProject>("/projects", {
        method: "POST",
        body: {
          name: opts.name,
          namespace_id: opts.namespaceId,
          visibility: "private",
          initialize_with_readme: false,
          ...(opts.description ? { description: opts.description } : {}),
        },
      });
      return toRepo(raw);
    },

    /** Replaces the whole topic list; use `addTopic` to keep what is there. */
    async setTopics(projectId: number | string, names: string[]): Promise<string[]> {
      const raw = await rest.request<RawProject>(`/projects/${encodeProjectRef(projectId)}`, {
        method: "PUT",
        body: { topics: names },
      });
      return raw.topics ?? names;
    },

    async addTopic(projectId: number | string, topic: string): Promise<string[]> {
      const current = await this.getRepo(projectId);
      if (current.topics.includes(topic)) return current.topics;
      return this.setTopics(projectId, [...current.topics, topic]);
    },

    async listBranches(projectId: number | string): Promise<BranchInfo[]> {
      const raws = await rest.paginate<{
        name: string;
        commit: { id: string };
        protected?: boolean;
      }>(`/projects/${encodeProjectRef(projectId)}/repository/branches`);
      return raws.map((b) => ({ name: b.name, sha: b.commit.id, protected: b.protected ?? false }));
    },

    /** Idempotent: a branch that is already gone is the outcome we wanted. */
    async deleteBranch(projectId: number | string, name: string): Promise<void> {
      try {
        await rest.request(
          `/projects/${encodeProjectRef(projectId)}/repository/branches/${encodeURIComponent(name)}`,
          { method: "DELETE" },
        );
      } catch (err) {
        if (err instanceof GitLabConflictError) return;
        if (err instanceof GitLabNotAccessibleError && err.status === 404) return;
        throw err;
      }
    },
  };
}

export type ReposApi = ReturnType<typeof createProjectsApi>;
