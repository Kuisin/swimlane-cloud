/**
 * Project discovery and registration.
 *
 * Projects are not created in this app's database first; they are found on
 * GitHub. A repository is a project when it carries the `swimlane` topic, and
 * a `projects` row (plus a `workspaces` row for its owner) is upserted the
 * first time someone opens it here — those rows exist only to key drafts,
 * versions, templates and audit entries.
 */
import type { RepoInfo } from "@swimlane-cloud/github-client";
import { ApiError } from "./api";
import { assertPlanAllowsProject, type Plan } from "./plans";
import { audit, roleFromPermissions, type Role } from "./projects";
import { seedProjectTemplates } from "./seed";
import { getServiceSupabase } from "./supabase/server";

/** The GitHub topic that marks a repository as a swimlane project. */
export const PROJECT_TOPIC = "swimlane";

export interface DiscoveredRepo {
  owner: string;
  ownerType: "user" | "org";
  repo: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string | null;
  pushedAt: string | null;
  role: Role;
  /** Set once the repository has been opened here at least once. */
  projectId: string | null;
}

function ownerType(info: RepoInfo): "user" | "org" {
  return info.ownerType === "Organization" ? "org" : "user";
}

/** Every accessible repository with the topic, joined with any existing project rows. */
export async function discoverProjects(repos: RepoInfo[]): Promise<{ repos: DiscoveredRepo[] }> {
  const supabase = getServiceSupabase();
  const ids = repos.map((r) => r.id);
  const known = new Map<number, string>();
  if (ids.length) {
    const { data } = await supabase
      .from("projects")
      .select("id, github_repo_id")
      .in("github_repo_id", ids);
    for (const row of data ?? []) known.set(Number(row.github_repo_id), row.id as string);
  }
  return {
    repos: repos.map((r) => ({
      owner: r.owner,
      ownerType: ownerType(r),
      repo: r.name,
      fullName: r.fullName,
      private: r.private,
      htmlUrl: r.htmlUrl,
      description: r.description,
      pushedAt: r.pushedAt,
      role: roleFromPermissions(r.permissions),
      projectId: known.get(r.id) ?? null,
    })),
  };
}

/**
 * The plan already on file for a GitHub owner, or `"free"` when no workspace
 * has been created for them yet (the default every workspace row starts on).
 * Looked up by login rather than by numeric id because at repo-creation time
 * — before the repository exists — there is no `RepoInfo` to read an id from.
 */
export async function getWorkspacePlanByOwner(owner: string): Promise<Plan> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("workspaces")
    .select("plan")
    .ilike("github_owner", owner)
    .maybeSingle();
  return (data?.plan as Plan | undefined) ?? "free";
}

/** Upsert the workspace row for a repository's owner; returns its id and plan. */
export async function ensureWorkspace(info: RepoInfo): Promise<{ id: string; plan: Plan }> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("workspaces")
    .upsert(
      {
        github_owner: info.owner,
        github_owner_type: ownerType(info),
        github_owner_id: info.ownerId,
        name: info.owner,
      },
      { onConflict: "github_owner_id" },
    )
    .select("id, plan")
    .single();
  if (error || !data) throw new ApiError(500, `workspace upsert failed: ${error?.message}`);
  return { id: data.id as string, plan: data.plan as Plan };
}

/**
 * Register (or find) the project row for a repository the caller can see.
 * The topic is required: opening an unmarked repository would let any
 * `.txt`-bearing repository become a project by URL.
 */
export async function ensureProject(
  info: RepoInfo,
  actor: { userId: string; login: string },
): Promise<{ projectId: string; workspaceId: string; created: boolean }> {
  if (!info.topics.includes(PROJECT_TOPIC)) {
    throw new ApiError(
      400,
      `Repository ${info.fullName} does not carry the "${PROJECT_TOPIC}" topic.`,
      {
        notMarked: true,
      },
    );
  }
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase
    .from("projects")
    .select("id, workspace_id")
    .eq("github_repo_id", info.id)
    .maybeSingle();
  if (existing) {
    return {
      projectId: existing.id as string,
      workspaceId: existing.workspace_id as string,
      created: false,
    };
  }

  const workspace = await ensureWorkspace(info);
  await assertPlanAllowsProject(workspace.id, workspace.plan);

  const { data: project, error } = await supabase
    .from("projects")
    .upsert(
      {
        workspace_id: workspace.id,
        github_repo: info.name,
        github_repo_id: info.id,
        name: info.name,
      },
      { onConflict: "github_repo_id" },
    )
    .select("id")
    .single();
  if (error || !project) throw new ApiError(500, `project insert failed: ${error?.message}`);
  const projectId = project.id as string;

  await seedProjectTemplates(projectId, actor.userId);
  await audit({
    workspaceId: workspace.id,
    projectId,
    userId: actor.userId,
    actorLogin: actor.login,
    action: "project.opened",
    entityType: "project",
    entityId: projectId,
  });
  return { projectId, workspaceId: workspace.id, created: true };
}
