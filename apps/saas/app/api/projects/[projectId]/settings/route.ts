import {
  parseDiagramSettings,
  PROD_BRANCH,
  REPO_SETTINGS_PATH,
  TEMPLATE_MODES,
  TEMPLATE_SECTIONS,
  type DiagramSettings,
  type TemplateMode,
  type TemplateSection,
} from "@swimlane-cloud/github-client";
import { withApi, json, readJson, ApiError } from "@/lib/api";
import {
  METADATA_FIELD_TYPES,
  isMetadataKey,
  parseMetadataFields,
  parseProjectSettings,
  projectSettingsJson,
  type MetadataField,
  type ProjectSettings,
} from "@/lib/metadata-schema";
import { requireProjectRole } from "@/lib/projects";
import { readTextAt } from "@/lib/repo-files";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET — `swimlane-settings.json` on main, defaults filled in. */
export const GET = withApi(async (_req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectRole(projectId, "viewer");
  const settings = parseProjectSettings(await readTextAt(project, REPO_SETTINGS_PATH, PROD_BRANCH));
  return json({ settings });
});

interface PatchBody {
  diagram?: Partial<DiagramSettings>;
  templates?: Partial<Record<TemplateSection, TemplateMode>>;
  /** The declared document-metadata fields, replacing whatever is on file. */
  metadata?: { fields?: unknown };
}

/**
 * The fields to store, refusing anything the settings page should not have
 * been able to send. `parseMetadataFields` is forgiving by design — a hand-
 * edited file must not break the app — but a request that means to declare a
 * field and gets it wrong should hear about it rather than have it silently
 * vanish.
 */
function checkedFields(raw: unknown): MetadataField[] {
  if (!Array.isArray(raw)) throw new ApiError(400, "metadata.fields must be an array");
  const seen = new Set<string>();
  for (const entry of raw) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const key = typeof e.key === "string" ? e.key.trim() : "";
    if (!key) throw new ApiError(400, "every metadata field needs a key");
    if (!isMetadataKey(key)) throw new ApiError(400, `invalid metadata key "${key}"`);
    if (seen.has(key)) throw new ApiError(400, `duplicate metadata key "${key}"`);
    seen.add(key);
    if (!(METADATA_FIELD_TYPES as readonly unknown[]).includes(e.type)) {
      throw new ApiError(400, `invalid type for metadata key "${key}"`);
    }
    if (e.type === "enum" && !(Array.isArray(e.values) && e.values.some((v) => String(v).trim()))) {
      throw new ApiError(400, `metadata key "${key}" is a choice list with no choices`);
    }
  }
  return parseMetadataFields(raw);
}

/** The file's vocabulary → the policy table's. */
const DB_MODE: Record<TemplateMode, "optional" | "default" | "forced"> = {
  none: "optional",
  base: "default",
  "template-only": "forced",
};

/**
 * The file is what people read; the policy table is what every save checks.
 * A template mode written here is mirrored into the table so
 * `assertForcedSections` needs no GitHub call on the hot path.
 */
async function syncTemplatePolicies(
  projectId: string,
  userId: string,
  modes: Partial<Record<TemplateSection, TemplateMode>>,
): Promise<void> {
  const supabase = getServiceSupabase();
  for (const section of TEMPLATE_SECTIONS) {
    const mode = modes[section];
    if (!mode) continue;
    let forcedId: string | null = null;
    if (mode === "template-only") {
      const { data: current } = await supabase
        .from("project_template_policies")
        .select("forced_template_id")
        .eq("project_id", projectId)
        .eq("section", section)
        .maybeSingle();
      forcedId = (current?.forced_template_id as string | null) ?? null;
      if (!forcedId) {
        const { data: templates } = await supabase
          .from("project_section_templates")
          .select("id, is_default, sort_order")
          .eq("project_id", projectId)
          .eq("section", section)
          .order("is_default", { ascending: false })
          .order("sort_order", { ascending: true })
          .limit(1);
        forcedId = (templates?.[0]?.id as string | undefined) ?? null;
      }
      if (!forcedId) {
        throw new ApiError(422, `Create a /${section}/ template before requiring it.`);
      }
    }
    const { error } = await supabase.from("project_template_policies").upsert(
      {
        project_id: projectId,
        section,
        mode: DB_MODE[mode],
        forced_template_id: forcedId,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,section" },
    );
    if (error) throw new ApiError(400, error.message);
  }
}

/**
 * PATCH — change the diagram settings and/or template modes. Written to
 * `main` directly: the file is one of the app's managed paths, which the
 * guard workflow exempts from its direct-push rule.
 */
export const PATCH = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const project = await requireProjectRole(projectId, "owner");
  const input = await readJson<PatchBody>(req);

  const existing = await readTextAt(project, REPO_SETTINGS_PATH, PROD_BRANCH);
  const current = parseProjectSettings(existing);

  const diagram = { ...current.diagram, ...(input.diagram ?? {}) };
  const checked = parseDiagramSettings(diagram);
  for (const key of Object.keys(checked) as (keyof DiagramSettings)[]) {
    if (checked[key] !== diagram[key]) throw new ApiError(400, `invalid diagram setting "${key}"`);
  }

  const templates = { ...current.templates };
  for (const [section, mode] of Object.entries(input.templates ?? {})) {
    if (!(TEMPLATE_SECTIONS as readonly string[]).includes(section)) {
      throw new ApiError(400, `invalid section "${section}"`);
    }
    if (!(TEMPLATE_MODES as readonly string[]).includes(String(mode))) {
      throw new ApiError(400, `invalid template mode "${String(mode)}"`);
    }
    templates[section as TemplateSection] = mode as TemplateMode;
  }

  // Absent means "leave the schema alone"; an empty array means "declare
  // nothing", which is how the settings page removes the last field.
  const fields = input.metadata ? checkedFields(input.metadata.fields) : current.metadata.fields;

  await syncTemplatePolicies(projectId, project.user.id, input.templates ?? {});

  const next: ProjectSettings = {
    ...current,
    diagram: checked,
    templates,
    metadata: { fields },
  };
  await project.write.putFile(
    REPO_SETTINGS_PATH,
    projectSettingsJson(next),
    PROD_BRANCH,
    `Update ${REPO_SETTINGS_PATH}`,
  );
  return json({ settings: next });
});
