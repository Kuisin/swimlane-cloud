/**
 * Project context and authorisation for API routes.
 *
 * A project is a GitHub repository; the caller's role in it is whatever GitHub
 * says their permissions are, read with their own token on every request.
 * Nothing here consults a membership table, because there is none.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isEditBranch,
  isIntegrationBranch,
  isProdBranch,
  type RepoInfo,
  type RepoPermissions,
} from "@swimlane-cloud/github-client";
import { ApiError } from "./api";
import { requireGitHubApis, withRepo, type GitHubApis } from "./github";
import type { RepoApis } from "./repo-apis";
import { getServiceSupabase } from "./supabase/server";
import {
  type PolicyEntry,
  type TemplateRow,
  type TemplateSection,
  isTemplateSection,
} from "./templates";

import type { LockReason, Role } from "./types";

export type { LockReason, Role };

const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

/** admin → owner, push → editor, pull → viewer. */
export function roleFromPermissions(p: RepoPermissions): Role {
  if (p.admin) return "owner";
  if (p.push) return "editor";
  return "viewer";
}

export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export interface ProjectRow {
  id: string;
  name: string;
  workspaceId: string;
  owner: string;
  ownerType: "user" | "org";
  repo: string;
  githubRepoId: number;
  plan: "free" | "team" | "enterprise";
}

/** The project row plus its workspace (service role; not an access check). */
export async function getProjectRow(projectId: string): Promise<ProjectRow> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, name, workspace_id, github_repo, github_repo_id, workspaces(github_owner, github_owner_type, plan)",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new ApiError(500, `project lookup failed: ${error.message}`);
  if (!data) throw new ApiError(404, "Project not found");
  const ws = (
    data as unknown as {
      workspaces: { github_owner: string; github_owner_type: "user" | "org"; plan: string } | null;
    }
  ).workspaces;
  if (!ws) throw new ApiError(500, "Project has no workspace");
  return {
    id: data.id as string,
    name: data.name as string,
    workspaceId: data.workspace_id as string,
    owner: ws.github_owner,
    ownerType: ws.github_owner_type,
    repo: data.github_repo as string,
    githubRepoId: Number(data.github_repo_id),
    plan: ws.plan as ProjectRow["plan"],
  };
}

export interface ProjectCtx extends RepoApis {
  user: { id: string; email?: string };
  project: ProjectRow;
  /** Live repository metadata from GitHub (permissions, default branch, topics). */
  repoInfo: RepoInfo;
  role: Role;
}

/**
 * The one gate every project route goes through: signed in → GitHub connected
 * → repository visible to that token → role at least `minRole`. A repository
 * the token cannot see is reported as 404 by GitHub, and we pass that on
 * rather than confirming the project exists.
 */
export async function requireProjectRole(projectId: string, minRole: Role): Promise<ProjectCtx> {
  const user = await requireUser();
  const project = await getProjectRow(projectId);
  const apis = withRepo(await requireGitHubApis(user.id), {
    owner: project.owner,
    repo: project.repo,
  });
  const repoInfo = await apis.repos.getRepo();
  const role = roleFromPermissions(repoInfo.permissions);
  if (!roleAtLeast(role, minRole)) {
    throw new ApiError(403, `This action needs the ${minRole} role (you are ${role}).`, {
      role,
      required: minRole,
    });
  }
  return { ...apis, user, project, repoInfo, role };
}

/**
 * The branch rules, in one place. `main` (公開済み) is published and never
 * edited in place; `preview` (承認済み) is the integration line, owners only;
 * an edit branch (`<login>/<timestamp>/<key>`) is where work happens; one with
 * an open pull request is frozen until it is merged or closed. Returns null
 * when the branch is writable for this role.
 */
export function branchLockReason(
  branch: string,
  role: Role,
  lockedBranches: ReadonlySet<string> | string[],
): LockReason | null {
  const locked = Array.isArray(lockedBranches) ? new Set(lockedBranches) : lockedBranches;
  if (isProdBranch(branch)) return "main";
  if (role === "viewer") return "viewer";
  if (locked.has(branch)) return "locked";
  if (isIntegrationBranch(branch)) return role === "owner" ? null : "previewOwnerOnly";
  if (isEditBranch(branch)) return null;
  return "other";
}

const LOCK_MESSAGES: Record<LockReason, string> = {
  main: "main is published (公開済み) and is never edited directly.",
  locked: "This branch has an open pull request and is locked until it is merged or closed.",
  previewOwnerOnly:
    "preview (承認済み) can only be edited by a repository admin — start an edit branch.",
  viewer: "You have read-only access to this repository.",
  other: "Only preview and edit branches can be edited here.",
};

export function assertBranchWritable(
  branch: string,
  role: Role,
  lockedBranches: ReadonlySet<string> | string[],
): void {
  const reason = branchLockReason(branch, role, lockedBranches);
  if (!reason) return;
  throw new ApiError(reason === "locked" ? 409 : 403, LOCK_MESSAGES[reason], {
    lockReason: reason,
    ...(reason === "locked" ? { locked: true } : {}),
  });
}

/** Edit branches with an open pull request, from the project's open PRs. */
export async function lockedBranches(ctx: RepoApis): Promise<Set<string>> {
  const open = await ctx.pulls.listPullRequests({ state: "open" });
  return new Set(open.map((p) => p.head).filter(isEditBranch));
}

export interface ProjectTemplates {
  policies: Record<string, PolicyEntry>;
  templatesById: Record<string, TemplateRow>;
}

/** Load forced-template policies + templates for a project (service role). */
export async function loadProjectTemplates(
  projectId: string,
  supabase?: SupabaseClient,
): Promise<ProjectTemplates> {
  const db = supabase ?? getServiceSupabase();

  const { data: templates, error: tErr } = await db
    .from("project_section_templates")
    .select("id, section, name, body")
    .eq("project_id", projectId);
  if (tErr) throw new ApiError(500, `templates load failed: ${tErr.message}`);

  const { data: policies, error: pErr } = await db
    .from("project_template_policies")
    .select("section, mode, forced_template_id")
    .eq("project_id", projectId);
  if (pErr) throw new ApiError(500, `policies load failed: ${pErr.message}`);

  const templatesById: Record<string, TemplateRow> = {};
  for (const t of templates ?? []) {
    if (!isTemplateSection(t.section as string)) continue;
    templatesById[t.id as string] = {
      id: t.id as string,
      section: t.section as TemplateSection,
      name: t.name as string,
      body: t.body as string,
    };
  }

  const policyMap: Record<string, PolicyEntry> = {};
  for (const p of policies ?? []) {
    policyMap[p.section as string] = {
      mode: p.mode as PolicyEntry["mode"],
      forcedTemplateId: (p.forced_template_id as string | null) ?? null,
    };
  }

  return { policies: policyMap, templatesById };
}

/** Append an audit_log row (best-effort; never throws into the caller). */
export async function audit(entry: {
  workspaceId: string;
  projectId?: string | null;
  userId?: string | null;
  actorLogin?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  commitSha?: string;
}): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("audit_log").insert({
      workspace_id: entry.workspaceId,
      project_id: entry.projectId ?? null,
      user_id: entry.userId ?? null,
      actor_login: entry.actorLogin ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      commit_sha: entry.commitSha ?? null,
    });
  } catch (err) {
    console.warn("[audit] failed", err);
  }
}

/** Require an authenticated user (from cookie session); throw 401 otherwise. */
export async function requireUser(): Promise<{ id: string; email?: string }> {
  const { getCurrentUser } = await import("./supabase/server");
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Authentication required", { needsAuth: true });
  return { id: user.id, email: user.email ?? undefined };
}

/** Signed-in user plus their GitHub clients (no project involved). */
export async function requireUserWithGitHub(): Promise<
  GitHubApis & { user: { id: string; email?: string } }
> {
  const user = await requireUser();
  const apis = await requireGitHubApis(user.id);
  return { ...apis, user };
}

/**
 * Re-exported from the shared branch model so the SaaS, the hub and the VS Code
 * extension cannot generate different branch names for the same input.
 */
export { slugify } from "@swimlane-cloud/github-client";

/** Random url-safe slug for public sharing. */
export function randomSlug(len = 10): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
