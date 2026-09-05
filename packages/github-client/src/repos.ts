/**
 * Repositories, accounts and branches — the discovery and provisioning surface.
 *
 * The SaaS does not register projects; it discovers them. A repository is a
 * swimlane project when it carries a GitHub *topic*, and `GET /user/repos`
 * returns `topics` and `permissions` inline for every repository the token can
 * see, so one paginated call answers "which projects can this user open, and
 * what may they do in each" with no per-repo round trip and no search-index
 * lag.
 */

import { GitHubConflictError, GitHubNotAccessibleError } from "./errors.ts";
import type { RestClient } from "./rest.ts";

export interface RepoPermissions {
  admin: boolean;
  push: boolean;
  pull: boolean;
}

export interface RepoInfo {
  id: number;
  owner: string;
  ownerId: number;
  ownerType: "User" | "Organization";
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  description: string | null;
  topics: string[];
  permissions: RepoPermissions;
  /** ISO timestamp of the last push; null for an empty repository. */
  pushedAt: string | null;
}

export interface GitHubAccount {
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

export interface OrgMembership {
  state: "active" | "pending";
  role: "admin" | "member";
}

interface RawRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  description: string | null;
  topics?: string[];
  permissions?: Partial<RepoPermissions>;
  owner: { login: string; id: number; type: string };
  pushed_at: string | null;
}

interface RawAccount {
  login: string;
  id: number;
  type?: string;
  avatar_url: string;
}

function toRepo(raw: RawRepo): RepoInfo {
  return {
    id: raw.id,
    owner: raw.owner.login,
    ownerId: raw.owner.id,
    ownerType: raw.owner.type === "Organization" ? "Organization" : "User",
    name: raw.name,
    fullName: raw.full_name,
    private: raw.private,
    defaultBranch: raw.default_branch,
    htmlUrl: raw.html_url,
    description: raw.description ?? null,
    topics: raw.topics ?? [],
    // Absent permissions means "we could read it", nothing more.
    permissions: {
      admin: raw.permissions?.admin ?? false,
      push: raw.permissions?.push ?? false,
      pull: raw.permissions?.pull ?? true,
    },
    pushedAt: raw.pushed_at ?? null,
  };
}

function toAccount(raw: RawAccount, type?: GitHubAccount["type"]): GitHubAccount {
  return {
    login: raw.login,
    id: raw.id,
    type: type ?? (raw.type === "Organization" ? "Organization" : "User"),
    avatarUrl: raw.avatar_url,
  };
}

function repoBase(owner: string, repo: string): string {
  return `/repos/${owner}/${repo}`;
}

export function createReposApi(rest: RestClient) {
  return {
    async getAuthenticatedUser(): Promise<GitHubAccount> {
      return toAccount(await rest.request<RawAccount>("/user"), "User");
    },

    /** Organisations the token's user belongs to (membership visible to the token). */
    async listUserOrgs(): Promise<GitHubAccount[]> {
      const raws = await rest.paginate<RawAccount>("/user/orgs");
      return raws.map((r) => toAccount(r, "Organization"));
    },

    /**
     * The token holder's own membership in an org — specifically, whether
     * they are an org *admin* (owner) rather than a plain member. Repo-level
     * `permissions.admin` (from `getRepo`) answers "can edit this repo"; this
     * answers "can this person spend the org's quota by creating new ones".
     * 404 means not a member at all, which is a "no", not an error.
     */
    async getOrgMembership(org: string): Promise<OrgMembership | null> {
      try {
        const raw = await rest.request<{ state: string; role: string }>(
          `/user/memberships/orgs/${encodeURIComponent(org)}`,
        );
        return {
          state: raw.state === "active" ? "active" : "pending",
          role: raw.role === "admin" ? "admin" : "member",
        };
      } catch (err) {
        if (err instanceof GitHubNotAccessibleError && err.status === 404) return null;
        throw err;
      }
    },

    async getRepo(owner: string, repo: string): Promise<RepoInfo> {
      return toRepo(await rest.request<RawRepo>(repoBase(owner, repo)));
    },

    /**
     * Every repository the token can see — owned, collaborated on, or reached
     * through an organisation — optionally narrowed to one topic. Sorted by
     * last push so the most active projects come first.
     */
    async listAccessibleRepos(opts: { topic?: string; max?: number } = {}): Promise<RepoInfo[]> {
      const params = new URLSearchParams({
        affiliation: "owner,collaborator,organization_member",
        sort: "pushed",
        direction: "desc",
      });
      // 30 pages × 100 = 3,000 repositories; beyond that a topic filter is
      // still applied client-side, so a busy account degrades to "most recent".
      const raws = await rest.paginate<RawRepo>(`/user/repos?${params}`, { max: opts.max ?? 30 });
      const repos = raws.map(toRepo);
      return opts.topic ? repos.filter((r) => r.topics.includes(opts.topic!)) : repos;
    },

    /**
     * `auto_init` is not optional in practice: the Git Data API cannot commit
     * into a repository with no HEAD, so a repository created without it can
     * only be seeded through the Contents API one file at a time.
     */
    async createRepo(opts: {
      name: string;
      org?: string;
      private?: boolean;
      description?: string;
      autoInit?: boolean;
    }): Promise<RepoInfo> {
      const path = opts.org ? `/orgs/${opts.org}/repos` : "/user/repos";
      const raw = await rest.request<RawRepo>(path, {
        method: "POST",
        body: {
          name: opts.name,
          private: opts.private ?? true,
          auto_init: opts.autoInit ?? true,
          ...(opts.description ? { description: opts.description } : {}),
        },
      });
      return toRepo(raw);
    },

    /** Replaces the whole topic list; use `addTopic` to keep what is there. */
    async setTopics(owner: string, repo: string, names: string[]): Promise<string[]> {
      const res = await rest.request<{ names: string[] }>(`${repoBase(owner, repo)}/topics`, {
        method: "PUT",
        body: { names },
      });
      return res.names;
    },

    async addTopic(owner: string, repo: string, topic: string): Promise<string[]> {
      const current = await rest.request<{ names: string[] }>(`${repoBase(owner, repo)}/topics`);
      if (current.names.includes(topic)) return current.names;
      return this.setTopics(owner, repo, [...current.names, topic]);
    },

    async listBranches(owner: string, repo: string): Promise<BranchInfo[]> {
      const raws = await rest.paginate<{
        name: string;
        commit: { sha: string };
        protected?: boolean;
      }>(`${repoBase(owner, repo)}/branches`);
      return raws.map((b) => ({
        name: b.name,
        sha: b.commit.sha,
        protected: b.protected ?? false,
      }));
    },

    /**
     * Idempotent: a branch that is already gone is the outcome we wanted.
     * GitHub answers 422 "Reference does not exist" for that case.
     */
    async deleteBranch(owner: string, repo: string, name: string): Promise<void> {
      try {
        await rest.request(`${repoBase(owner, repo)}/git/refs/heads/${encodeURIComponent(name)}`, {
          method: "DELETE",
        });
      } catch (err) {
        if (err instanceof GitHubConflictError) return;
        if (err instanceof GitHubNotAccessibleError && err.status === 404) return;
        throw err;
      }
    },
  };
}

export type ReposApi = ReturnType<typeof createReposApi>;
