/**
 * GitLab project discovery and registration — the workspace-scoped analogue
 * of `discovery.ts`.
 *
 * GitHub discovery spans every organisation the signed-in user belongs to,
 * because GitHub tokens are global. A GitLab workspace already names one
 * specific instance + namespace (set once at claim time — see
 * `gitlab-instances.ts`), so discovery here is scoped to a single,
 * already-known workspace rather than "every namespace this user can see".
 *
 * Phase 1 supports creating a brand-new project and attaching an existing
 * one; it does not create a workspace here (that only happens through the
 * claim flow) and does not touch review/publish (see the explicit
 * `provider !== "github"` guards on those routes).
 */
import { INTEGRATION_BRANCH, PROD_BRANCH, REPO_CONFIG_PATH } from "@swimlane-cloud/github-client";
import { createWriteApi, type RepoInfo } from "@swimlane-cloud/gitlab-client";
import { ApiError } from "./api";
import { PROJECT_TOPIC, type DiscoveredRepo } from "./discovery";
import { requireGitLabApis, type GitLabApis } from "./gitlab";
import { assertPlanAllowsProject, type Plan } from "./plans";
import { audit, roleFromPermissions } from "./projects";
import { repoConfigJson, seedProjectTemplates, seedRepoFiles } from "./seed";
import { getServiceSupabase } from "./supabase/server";

export interface GitlabWorkspaceRow {
  id: string;
  instanceId: string;
  namespaceId: number;
  namespacePath: string;
  plan: Plan;
}

interface RawWorkspaceRow {
  id: string;
  provider: string;
  gitlab_instance_id: string | null;
  gitlab_namespace_id: number | null;
  gitlab_namespace_path: string | null;
  plan: Plan;
}

export async function getGitlabWorkspace(workspaceId: string): Promise<GitlabWorkspaceRow | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, provider, gitlab_instance_id, gitlab_namespace_id, gitlab_namespace_path, plan")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new ApiError(500, `workspace lookup failed: ${error.message}`);
  const row = data as unknown as RawWorkspaceRow | null;
  if (!row || row.provider !== "gitlab") return null;
  if (!row.gitlab_instance_id || row.gitlab_namespace_id === null || !row.gitlab_namespace_path) {
    throw new ApiError(500, "GitLab workspace is missing its namespace.");
  }
  return {
    id: row.id,
    instanceId: row.gitlab_instance_id,
    namespaceId: row.gitlab_namespace_id,
    namespacePath: row.gitlab_namespace_path,
    plan: row.plan,
  };
}

async function requireGitlabWorkspace(workspaceId: string): Promise<GitlabWorkspaceRow> {
  const workspace = await getGitlabWorkspace(workspaceId);
  if (!workspace) throw new ApiError(404, "GitLab workspace not found");
  return workspace;
}

/** Signed-in user's GitLab clients for a workspace's instance, plus the workspace row. */
export async function requireGitlabWorkspaceApis(
  userId: string,
  workspaceId: string,
): Promise<{ apis: GitLabApis; workspace: GitlabWorkspaceRow }> {
  const workspace = await requireGitlabWorkspace(workspaceId);
  const apis = await requireGitLabApis(userId, workspace.instanceId);
  return { apis, workspace };
}

function toDiscoveredRepo(info: RepoInfo, projectId: string | null): DiscoveredRepo {
  return {
    owner: info.owner,
    ownerType: info.ownerType === "Organization" ? "org" : "user",
    repo: info.name,
    fullName: info.fullName,
    private: info.private,
    htmlUrl: info.htmlUrl,
    description: info.description,
    pushedAt: info.pushedAt,
    role: roleFromPermissions(info.permissions),
    projectId,
  };
}

/** Every project in the workspace's namespace with the topic, joined with any existing project rows. */
export async function discoverGitlabProjects(
  apis: GitLabApis,
  workspace: GitlabWorkspaceRow,
): Promise<{ repos: DiscoveredRepo[] }> {
  const projects = await apis.repos.listNamespaceProjects(workspace.namespaceId, {
    topic: PROJECT_TOPIC,
  });
  const supabase = getServiceSupabase();
  const ids = projects.map((p) => p.id);
  const known = new Map<number, string>();
  if (ids.length) {
    const { data } = await supabase
      .from("projects")
      .select("id, gitlab_project_id")
      .in("gitlab_project_id", ids);
    for (const row of data ?? []) known.set(Number(row.gitlab_project_id), row.id as string);
  }
  return { repos: projects.map((p) => toDiscoveredRepo(p, known.get(p.id) ?? null)) };
}

/** Register (or find) the project row for a GitLab project the caller can see. */
export async function ensureGitlabProject(
  info: RepoInfo,
  workspace: GitlabWorkspaceRow,
  actor: { userId: string; login: string },
): Promise<{ projectId: string; workspaceId: string; created: boolean }> {
  if (!info.topics.includes(PROJECT_TOPIC)) {
    throw new ApiError(
      400,
      `Project ${info.fullName} does not carry the "${PROJECT_TOPIC}" topic.`,
      {
        notMarked: true,
      },
    );
  }
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase
    .from("projects")
    .select("id, workspace_id")
    .eq("gitlab_project_id", info.id)
    .maybeSingle();
  if (existing) {
    return {
      projectId: existing.id as string,
      workspaceId: existing.workspace_id as string,
      created: false,
    };
  }

  await assertPlanAllowsProject(workspace.id, workspace.plan);

  const { data: project, error } = await supabase
    .from("projects")
    .upsert(
      {
        workspace_id: workspace.id,
        gitlab_project_id: info.id,
        gitlab_project_path: info.fullName,
        name: info.name,
      },
      { onConflict: "gitlab_project_id" },
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

/**
 * Create a brand-new GitLab project (seed commit, branches, topic) — the
 * GitLab analogue of `app/api/projects/route.ts`'s `mode: "create"`. Unlike
 * GitHub's `auto_init`, an empty GitLab project has no branches at all until
 * the first commit, so the seed commit itself both creates the default
 * branch and adds the seed files — no separate initialise step is needed.
 */
export async function createGitlabProject(
  apis: GitLabApis,
  workspace: GitlabWorkspaceRow,
  opts: { name: string; description?: string },
  actor: { userId: string; login: string },
): Promise<{ projectId: string; htmlUrl: string }> {
  await assertPlanAllowsProject(workspace.id, workspace.plan);

  const created = await apis.repos.createRepo({
    name: opts.name,
    namespaceId: workspace.namespaceId,
    ...(opts.description ? { description: opts.description } : {}),
  });

  const write = createWriteApi(apis.rest, created.id);
  const defaultBranch = created.defaultBranch || PROD_BRANCH;

  await write.commitFiles({
    branch: defaultBranch,
    message: "Seed diagrams, section templates and .swimlane.json",
    files: seedRepoFiles(created.name),
    author: { name: apis.login, email: apis.commitAuthorEmail },
  });
  if (defaultBranch !== PROD_BRANCH) {
    await write.ensureBranch(PROD_BRANCH, defaultBranch);
  }
  await write.ensureBranch(INTEGRATION_BRANCH, PROD_BRANCH);
  await apis.repos.addTopic(created.id, PROJECT_TOPIC);

  const info = await apis.repos.getRepo(created.id);
  const result = await ensureGitlabProject(info, workspace, actor);
  return { projectId: result.projectId, htmlUrl: info.htmlUrl };
}

/**
 * Attach an existing GitLab project — the GitLab analogue of
 * `app/api/projects/route.ts`'s `mode: "mark"`.
 */
export async function attachGitlabProject(
  apis: GitLabApis,
  workspace: GitlabWorkspaceRow,
  projectPath: string,
  actor: { userId: string; login: string },
): Promise<{ projectId: string; htmlUrl: string }> {
  const info = await apis.repos.getRepo(projectPath);
  if (!info.permissions.admin) {
    throw new ApiError(403, "Only a project Maintainer can mark it as a swimlane project.");
  }

  const write = createWriteApi(apis.rest, info.id);

  if (info.defaultBranch && info.defaultBranch !== PROD_BRANCH) {
    await write.ensureBranch(PROD_BRANCH, info.defaultBranch);
  }
  await write.ensureBranch(INTEGRATION_BRANCH, PROD_BRANCH);

  const hasConfig = (await write.readFile(REPO_CONFIG_PATH, INTEGRATION_BRANCH)) !== null;
  if (!hasConfig) {
    // Unknown layout: root the diagram tree at the repository root.
    await write.putFile(
      REPO_CONFIG_PATH,
      repoConfigJson(info.name, ""),
      INTEGRATION_BRANCH,
      "Add .swimlane.json",
    );
  }
  await apis.repos.addTopic(info.id, PROJECT_TOPIC);

  const marked = await apis.repos.getRepo(info.id);
  const result = await ensureGitlabProject(marked, workspace, actor);
  return { projectId: result.projectId, htmlUrl: marked.htmlUrl };
}
