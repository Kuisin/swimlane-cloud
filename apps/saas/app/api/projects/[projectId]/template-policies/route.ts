import { withApi, json, readJson, ApiError } from "@/lib/api";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireUser } from "@/lib/projects";
import { isTemplateSection, TEMPLATE_SECTIONS } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET — per-section policies (all five sections present, default optional). */
export const GET = withApi(async (_req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const supabase = getServiceSupabase();

  const { data: rows, error } = await supabase
    .from("project_template_policies")
    .select("section, mode, forced_template_id")
    .eq("project_id", projectId);
  if (error) throw new ApiError(500, error.message);

  // Include forcedBody for forced sections so the editor can lock + prefill.
  const forcedIds = (rows ?? [])
    .map((r) => r.forced_template_id as string | null)
    .filter((id): id is string => !!id);
  const bodies: Record<string, string> = {};
  if (forcedIds.length > 0) {
    const { data: templates } = await supabase
      .from("project_section_templates")
      .select("id, body")
      .in("id", forcedIds);
    for (const t of templates ?? []) bodies[t.id as string] = t.body as string;
  }

  const policies: Record<string, unknown> = {};
  for (const section of TEMPLATE_SECTIONS) policies[section] = { mode: "optional" };
  for (const r of rows ?? []) {
    const fid = r.forced_template_id as string | null;
    policies[r.section as string] = {
      mode: r.mode,
      forcedTemplateId: fid ?? undefined,
      forcedBody: fid ? bodies[fid] : undefined,
    };
  }
  return json({ policies });
});

interface PatchBody {
  section: string;
  mode: "optional" | "default" | "forced";
  forced_template_id?: string | null;
}

/** PATCH — set a section policy. forced requires a template of same project+section. */
export const PATCH = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const user = await requireUser();
  const input = await readJson<PatchBody>(req);
  if (!isTemplateSection(input.section)) {
    throw new ApiError(400, "invalid section");
  }
  if (!["optional", "default", "forced"].includes(input.mode)) {
    throw new ApiError(400, "invalid mode");
  }

  let forcedId: string | null = null;
  if (input.mode === "forced") {
    forcedId = input.forced_template_id ?? null;
    if (!forcedId) {
      throw new ApiError(400, "forced mode requires forced_template_id");
    }
    // Verify the template belongs to this project + section.
    const supabase = getServiceSupabase();
    const { data: tpl } = await supabase
      .from("project_section_templates")
      .select("id")
      .eq("id", forcedId)
      .eq("project_id", projectId)
      .eq("section", input.section)
      .maybeSingle();
    if (!tpl) {
      throw new ApiError(
        400,
        "forced_template_id must reference a template of the same project and section",
      );
    }
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase.from("project_template_policies").upsert(
    {
      project_id: projectId,
      section: input.section,
      mode: input.mode,
      forced_template_id: forcedId,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,section" },
  );
  if (error) throw new ApiError(400, error.message);
  return json({ section: input.section, mode: input.mode });
});
