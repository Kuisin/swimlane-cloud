import { withApi, json, readJson, ApiError } from "@/lib/api";
import { getGitea } from "@/lib/gitea";
import { getServiceSupabase } from "@/lib/supabase/server";
import { audit, requireUser, slugify } from "@/lib/projects";
import { templateRepoPath, TEMPLATE_SECTIONS } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CreateWorkspaceBody {
  name: string;
  slug?: string;
  projectName?: string;
}

// Seed section template fragments (one default per section).
const SEED_TEMPLATES: Record<
  (typeof TEMPLATE_SECTIONS)[number],
  { name: string; slug: string; body: string }
> = {
  page: {
    name: "Standard page",
    slug: "standard",
    body: "header-center: Untitled process;\nfooter-right: Confidential;",
  },
  option: {
    name: "Standard gutters",
    slug: "standard",
    body: "show-left-gutter: true;\nshow-right-gutter: true;\nshow-header: true;\nshow-footer: true;",
  },
  role: {
    name: "Default lane",
    slug: "default",
    body: "<role01: Team> #blue",
  },
  block: {
    name: "Terminal block",
    slug: "terminal",
    body: "<start: Start>\n<end: End>",
  },
  prop: {
    name: "Note prop",
    slug: "note",
    body: "<note: Note>",
  },
};

const SEED_DIAGRAM_PATH = "diagrams/sample.txt";
const SEED_DIAGRAM = `@kai-swimlane
/title/
Sample flow
/option/
show-left-gutter: true;
show-right-gutter: true;
/role/
<role01: Team> #blue
/line/
[role01: Start]
[role01: Done]
@end
`;

/**
 * POST /api/workspaces — workspace onboarding (plan Step 1.3).
 * Creates the workspace, a Gitea org, a default repo (auto_init main), ensures
 * a `test` branch, seeds the folder tree + section templates, inserts the
 * project, and syncs `diagrams` rows.
 */
export const POST = withApi(async (req) => {
  const user = await requireUser();
  const body = await readJson<CreateWorkspaceBody>(req);
  if (!body.name) throw new ApiError(400, "name is required");

  const slug = slugify(body.slug ?? body.name);
  const projectName = body.projectName ?? "Default project";
  const repoName = slugify(projectName);

  const supabase = getServiceSupabase();
  const gitea = getGitea();

  // 1. INSERT workspace
  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .insert({ name: body.name, slug, gitea_org_name: slug })
    .select("id")
    .single();
  if (wsErr) throw new ApiError(400, `workspace insert failed: ${wsErr.message}`);
  const workspaceId = ws.id as string;

  // Creator becomes owner.
  await supabase
    .from("workspace_members")
    .insert({ workspace_id: workspaceId, user_id: user.id, role: "owner" });

  // 2. Gitea org
  await gitea.createOrg(slug);

  // 3. Default repo (auto_init -> main with README)
  await gitea.createRepo(slug, repoName);

  // 4. Ensure test branch
  await gitea.ensureBranch(slug, repoName, "test", "main");

  // 5 + 6. Seed folder tree + section template mirror in one commit on test.
  const seedFiles: { path: string; text: string }[] = [
    { path: "diagrams/README.md", text: "# Diagrams\n\nDSL `.txt` files live here.\n" },
    { path: SEED_DIAGRAM_PATH, text: SEED_DIAGRAM },
  ];
  for (const section of TEMPLATE_SECTIONS) {
    const tpl = SEED_TEMPLATES[section];
    seedFiles.push({ path: templateRepoPath(section, tpl.slug), text: tpl.body });
  }
  await gitea.multiPathCommit(
    slug,
    repoName,
    seedFiles,
    "test",
    "Seed initial folder tree and section templates",
  );
  // Mirror seeds onto main too so the default branch isn't empty of content.
  await gitea.multiPathCommit(
    slug,
    repoName,
    seedFiles,
    "main",
    "Seed initial folder tree and section templates",
  );

  // 7. INSERT project
  const { data: project, error: pErr } = await supabase
    .from("projects")
    .insert({
      workspace_id: workspaceId,
      name: projectName,
      gitea_repo_name: repoName,
    })
    .select("id")
    .single();
  if (pErr) throw new ApiError(400, `project insert failed: ${pErr.message}`);
  const projectId = project.id as string;

  // Section template rows (source of truth) + default policies.
  for (const section of TEMPLATE_SECTIONS) {
    const tpl = SEED_TEMPLATES[section];
    await supabase.from("project_section_templates").insert({
      project_id: projectId,
      section,
      name: tpl.name,
      slug: tpl.slug,
      body: tpl.body,
      is_default: true,
      created_by: user.id,
    });
    await supabase.from("project_template_policies").insert({
      project_id: projectId,
      section,
      mode: "optional",
      updated_by: user.id,
    });
  }

  // Sync diagrams rows from the seeded .txt tree on test.
  const tree = await gitea.listTree(slug, repoName, "test", { ext: ".txt" });
  for (const entry of tree) {
    if (entry.path.startsWith("templates/")) continue; // template mirror, not a diagram
    await supabase.from("diagrams").insert({
      project_id: projectId,
      name: entry.path.split("/").pop() ?? entry.path,
      filepath_in_repo: entry.path,
      created_by: user.id,
    });
  }

  await audit({
    workspaceId,
    userId: user.id,
    action: "workspace.created",
    entityType: "workspace",
    entityId: workspaceId,
  });

  return json({ workspaceId, projectId, slug, repoName }, 201);
});
