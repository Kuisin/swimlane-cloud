import { withApi, json, readJson, ApiError } from "@/lib/api";
import { getGitea } from "@/lib/gitea";
import { getServiceSupabase } from "@/lib/supabase/server";
import { audit, getRepoCoords, requireUser, slugify } from "@/lib/projects";
import {
  isTemplateSection,
  templateRepoPath,
  type TemplateSection,
} from "@/lib/templates";
// Validate fragments with the shared parser before persisting.
import { parseDSL, parseDSLParts } from "@swimlane-cloud/diagram-converter/parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function requireSection(value: string | null): TemplateSection {
  if (!value || !isTemplateSection(value)) {
    throw new ApiError(400, "section must be one of page|option|role|block|prop");
  }
  return value;
}

/**
 * Validate a template body fragment. block/prop fragments are validated via
 * parseDSLParts; the rest via parseDSL wrapped in a minimal document so the
 * parser sees a valid section context.
 */
function validateBody(section: TemplateSection, body: string): void {
  let errors: Array<{ msg?: string }> = [];
  try {
    if (section === "block" || section === "prop") {
      errors = parseDSLParts(`/${section}/\n${body}`).errors ?? [];
    } else {
      errors =
        parseDSL(`@kai-swimlane\n/${section}/\n${body}\n@end`).errors ?? [];
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid fragment";
    throw new ApiError(422, `Invalid /${section}/ fragment: ${msg}`);
  }
  if (errors.length > 0) {
    throw new ApiError(
      422,
      `Invalid /${section}/ fragment: ${errors[0]?.msg ?? "parse error"}`,
    );
  }
}

async function mirrorToRepo(
  projectId: string,
  section: TemplateSection,
  slug: string,
  body: string,
  remove = false,
): Promise<void> {
  const { org, repo } = await getRepoCoords(projectId);
  const gitea = getGitea();
  const path = templateRepoPath(section, slug);
  if (remove) {
    // Soft approach: overwrite with empty to keep history; full delete optional.
    await gitea.upsertFile(org, repo, path, "", "test", {
      message: `Remove template ${section}/${slug}`,
    });
    return;
  }
  await gitea.upsertFile(org, repo, path, body, "test", {
    message: `Update template ${section}/${slug}`,
  });
}

/** GET ...?section= — list templates (optionally filtered by section). */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const sectionParam = url.searchParams.get("section");

  const supabase = getServiceSupabase();
  let query = supabase
    .from("project_section_templates")
    .select("id, section, name, slug, body, is_default, sort_order")
    .eq("project_id", projectId)
    .order("section")
    .order("sort_order");
  if (sectionParam) {
    query = query.eq("section", requireSection(sectionParam));
  }
  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return json({ templates: data ?? [] });
});

interface TemplateBody {
  section: string;
  name: string;
  slug?: string;
  body: string;
  is_default?: boolean;
}

/** POST — create a template. */
export const POST = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const user = await requireUser();
  const input = await readJson<TemplateBody>(req);
  const section = requireSection(input.section);
  if (!input.name || !input.body) throw new ApiError(400, "name and body required");
  validateBody(section, input.body);
  const slug = slugify(input.slug ?? input.name);

  const supabase = getServiceSupabase();
  if (input.is_default) {
    await supabase
      .from("project_section_templates")
      .update({ is_default: false })
      .eq("project_id", projectId)
      .eq("section", section);
  }
  const { data, error } = await supabase
    .from("project_section_templates")
    .insert({
      project_id: projectId,
      section,
      name: input.name,
      slug,
      body: input.body,
      is_default: input.is_default ?? false,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new ApiError(400, error.message);

  await mirrorToRepo(projectId, section, slug, input.body);
  const { workspaceId } = await getRepoCoords(projectId);
  await audit({
    workspaceId,
    userId: user.id,
    action: "template.created",
    entityType: "template",
    entityId: data.id as string,
  });
  return json({ id: data.id }, 201);
});

interface PatchBody extends TemplateBody {
  id: string;
}

/** PATCH — update a template by id. */
export const PATCH = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const user = await requireUser();
  const input = await readJson<PatchBody>(req);
  if (!input.id) throw new ApiError(400, "id is required");
  const section = requireSection(input.section);
  validateBody(section, input.body);
  const slug = slugify(input.slug ?? input.name);

  const supabase = getServiceSupabase();
  if (input.is_default) {
    await supabase
      .from("project_section_templates")
      .update({ is_default: false })
      .eq("project_id", projectId)
      .eq("section", section);
  }
  const { error } = await supabase
    .from("project_section_templates")
    .update({
      name: input.name,
      slug,
      body: input.body,
      is_default: input.is_default ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("project_id", projectId);
  if (error) throw new ApiError(400, error.message);

  await mirrorToRepo(projectId, section, slug, input.body);
  return json({ id: input.id });
});

/** DELETE ?id= — delete a template (blocked if currently forced). */
export const DELETE = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  await requireUser();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ApiError(400, "id is required");

  const supabase = getServiceSupabase();

  // Cannot delete a template currently pinned as forced.
  const { data: pinned } = await supabase
    .from("project_template_policies")
    .select("section")
    .eq("project_id", projectId)
    .eq("forced_template_id", id)
    .maybeSingle();
  if (pinned) {
    throw new ApiError(
      409,
      "Template is currently forced; relax the policy before deleting.",
    );
  }

  const { data: row } = await supabase
    .from("project_section_templates")
    .select("section, slug")
    .eq("id", id)
    .eq("project_id", projectId)
    .maybeSingle();

  const { error } = await supabase
    .from("project_section_templates")
    .delete()
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) throw new ApiError(400, error.message);

  if (row && isTemplateSection(row.section as string)) {
    await mirrorToRepo(
      projectId,
      row.section as TemplateSection,
      row.slug as string,
      "",
      true,
    );
  }
  return json({ deleted: id });
});
