/**
 * What a freshly created project repository starts with, and the section
 * templates every project row is seeded with. Kept in one place so the
 * repository seed and the database seed cannot drift apart.
 */
import { REPO_CONFIG_PATH, type FileWrite } from "@swimlane-cloud/github-client";
import { getServiceSupabase } from "./supabase/server";
import { TEMPLATE_SECTIONS, templateRepoPath, type TemplateSection } from "./templates";

export const DIAGRAMS_ROOT = "diagrams";

export const SEED_TEMPLATES: Record<TemplateSection, { name: string; slug: string; body: string }> =
  {
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
      // A lane is an id followed by `;`-terminated properties (dsl-rule.md
      // §/role/). The inline `<id: label>` form is only valid in /line/.
      body: "<role01>\nlabel: Team;\nbackground-color: #e6f2ff;",
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

export const SEED_DIAGRAM_PATH = `${DIAGRAMS_ROOT}/sample.txt`;

export const SEED_DIAGRAM = `@kai-swimlane
/title/
Sample flow
/option/
show-left-gutter: true;
show-right-gutter: true;
/role/
<role01>
label: Team;
background-color: #e6f2ff;
/line/
[role01: Start]
[role01: Done]
@end
`;

/** `.swimlane.json` for a repository this app created. */
export function repoConfigJson(title: string, diagramsRoot = DIAGRAMS_ROOT): string {
  return `${JSON.stringify(
    { diagramsRoot, title, themeKey: "basic", integrationBranch: "test" },
    null,
    2,
  )}\n`;
}

/** The initial commit of a created repository: config, a sample, and the template mirror. */
export function seedRepoFiles(title: string): FileWrite[] {
  const files: FileWrite[] = [
    { path: REPO_CONFIG_PATH, text: repoConfigJson(title) },
    {
      path: `${DIAGRAMS_ROOT}/README.md`,
      text: "# Diagrams\n\nkai-swimlane `.txt` files live here. Open this repository in Swimlane Cloud to edit them with a live preview.\n",
    },
    { path: SEED_DIAGRAM_PATH, text: SEED_DIAGRAM },
  ];
  for (const section of TEMPLATE_SECTIONS) {
    const tpl = SEED_TEMPLATES[section];
    files.push({ path: templateRepoPath(section, tpl.slug), text: tpl.body });
  }
  return files;
}

/** Insert the default section templates + optional policies for a new project row. Idempotent. */
export async function seedProjectTemplates(projectId: string, userId: string): Promise<void> {
  const supabase = getServiceSupabase();
  const { count } = await supabase
    .from("project_section_templates")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (count && count > 0) return;

  await supabase.from("project_section_templates").insert(
    TEMPLATE_SECTIONS.map((section) => ({
      project_id: projectId,
      section,
      name: SEED_TEMPLATES[section].name,
      slug: SEED_TEMPLATES[section].slug,
      body: SEED_TEMPLATES[section].body,
      is_default: true,
      created_by: userId,
    })),
  );
  await supabase.from("project_template_policies").upsert(
    TEMPLATE_SECTIONS.map((section) => ({
      project_id: projectId,
      section,
      mode: "optional",
      updated_by: userId,
    })),
    { onConflict: "project_id,section" },
  );
}
