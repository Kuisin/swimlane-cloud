import {
  INTEGRATION_BRANCH,
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
import { LAYOUT_SETTINGS } from "@swimlane-cloud/diagram-converter/diagram-layout";
import { assertRef } from "@/lib/guard";
import { assertBranchWritable, lockedBranches, requireProjectRole } from "@/lib/projects";
import { readTextAt } from "@/lib/repo-files";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LAYOUT_BOUNDS = new Map(LAYOUT_SETTINGS.map((setting) => [setting.key, setting]));

/**
 * Per-key layout bounds, which `parseDiagramSettings` deliberately does not
 * know: `@swimlane-cloud/github-client` stays free of an engine dependency so
 * it remains light enough for the extension host, and the renderer ignores a
 * value it cannot use anyway. An editor, though, must be told rather than have
 * its input silently dropped.
 */
function assertLayout(layout: Record<string, number>): void {
  for (const [key, value] of Object.entries(layout)) {
    const spec = LAYOUT_BOUNDS.get(key);
    if (!spec) throw new ApiError(400, `"${key}" is not a layout setting.`);
    if (!Number.isFinite(value) || value < spec.min || value > spec.max) {
      throw new ApiError(400, `"${key}" must be between ${spec.min} and ${spec.max}.`);
    }
  }
}

/**
 * The settings text in force on `branch`, and where it came from.
 *
 * A pending edit wins over the commit, and `main` is the fallback for a branch
 * cut before the file existed — otherwise opening the editor on a fresh branch
 * would show the defaults and invite someone to "restore" settings the
 * repository never lost.
 */
async function settingsAt(
  project: Awaited<ReturnType<typeof requireProjectRole>>,
  projectId: string,
  branch: string,
): Promise<{ text: string | null; source: "draft" | "git" | "default" }> {
  const supabase = getServiceSupabase();
  const { data: draft } = await supabase
    .from("drafts")
    .select("dsl_text, deleted")
    .eq("project_id", projectId)
    .eq("filepath", REPO_SETTINGS_PATH)
    .eq("branch", branch)
    .maybeSingle();
  if (draft && !draft.deleted) return { text: draft.dsl_text as string, source: "draft" };

  const onBranch = await readTextAt(project, REPO_SETTINGS_PATH, branch);
  if (onBranch !== null) return { text: onBranch, source: "git" };

  const onProd =
    branch === PROD_BRANCH ? null : await readTextAt(project, REPO_SETTINGS_PATH, PROD_BRANCH);
  return onProd !== null ? { text: onProd, source: "git" } : { text: null, source: "default" };
}

/** Whether this caller could write a draft on `branch` right now. */
function branchLocked(
  branch: string,
  project: Awaited<ReturnType<typeof requireProjectRole>>,
): boolean {
  try {
    assertBranchWritable(branch, project.role, new Set<string>());
    return false;
  } catch {
    return true;
  }
}

/** GET ?branch= — the settings in force on a branch, defaults filled in. */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const branch = new URL(req.url).searchParams.get("branch") ?? PROD_BRANCH;
  assertRef(branch);
  const project = await requireProjectRole(projectId, "viewer");
  const { text, source } = await settingsAt(project, projectId, branch);
  return json({
    settings: parseProjectSettings(text),
    branch,
    source,
    raw: text,
    editable: branch !== PROD_BRANCH && !branchLocked(branch, project),
  });
});

interface PatchBody {
  /** The branch to record the pending change on. Defaults to the approved line. */
  branch?: string;
  /** JSON mode: the whole file, replacing every field below. */
  raw?: string;
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
 * PATCH — change the diagram settings, page layout, template modes and/or the
 * metadata schema.
 *
 * Recorded as a *pending* change, not a commit: the same `drafts` row an edited
 * diagram produces, so the branch shows as dirty, the change lands with the
 * next checkpoint and reaches `main` through the usual pull request. Settings
 * are content here, and content does not skip review.
 *
 * The one exception is the template-policy table, mirrored to Postgres
 * immediately — `assertForcedSections` reads it on the hot path of every save
 * and cannot wait on a checkpoint. A template mode therefore takes effect at
 * once, while the file records it at the next commit.
 */
export const PATCH = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const input = await readJson<PatchBody>(req);
  const branch = input.branch ?? INTEGRATION_BRANCH;
  assertRef(branch);

  const project = await requireProjectRole(projectId, "editor");
  assertBranchWritable(branch, project.role, await lockedBranches(project));

  const { text: currentText } = await settingsAt(project, projectId, branch);
  const current = parseProjectSettings(currentText);

  let next: ProjectSettings;
  if (typeof input.raw === "string") {
    // JSON mode hands over the whole file. Parsing is lenient by design, so
    // reject anything that is not an object outright rather than quietly
    // saving the defaults over someone's settings.
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.raw);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "could not be parsed";
      throw new ApiError(422, `${REPO_SETTINGS_PATH} is not valid JSON: ${detail}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ApiError(422, `${REPO_SETTINGS_PATH} must be a JSON object.`);
    }
    next = parseProjectSettings(input.raw);
    assertLayout(next.diagram.layout);
  } else {
    const diagram = { ...current.diagram, ...(input.diagram ?? {}) };
    assertLayout(diagram.layout ?? {});
    const checked = parseDiagramSettings(diagram);
    for (const key of Object.keys(checked) as (keyof DiagramSettings)[]) {
      // `layout` is a map: compared by value below, not by identity.
      if (key === "layout") continue;
      if (checked[key] !== diagram[key]) {
        throw new ApiError(400, `invalid diagram setting "${key}"`);
      }
    }
    if (JSON.stringify(checked.layout) !== JSON.stringify(diagram.layout ?? {})) {
      throw new ApiError(400, 'invalid diagram setting "layout"');
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

    next = { ...current, diagram: checked, templates, metadata: { fields } };
  }

  if (Object.keys(input.templates ?? {}).length > 0) {
    await syncTemplatePolicies(projectId, project.user.id, input.templates ?? {});
  }

  const raw = projectSettingsJson(next);
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("drafts").upsert(
    {
      project_id: projectId,
      filepath: REPO_SETTINGS_PATH,
      branch,
      dsl_text: raw,
      deleted: false,
      updated_by: project.user.id,
      updated_by_login: project.login,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,filepath,branch" },
  );
  if (error) throw new ApiError(500, `settings draft failed: ${error.message}`);

  return json({ settings: next, branch, raw, pending: true });
});
