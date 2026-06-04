/**
 * Shared server helpers for resolving project repo coordinates, the active
 * edit branch, and forced-template policy/templates. Used by API routes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./api";
import { getServiceSupabase } from "./supabase/server";
import {
  type PolicyEntry,
  type TemplateRow,
  type TemplateSection,
  isTemplateSection,
} from "./templates";

export interface RepoCoords {
  projectId: string;
  workspaceId: string;
  org: string; // gitea org (workspace slug)
  repo: string; // gitea repo name
}

/** Resolve the Gitea org/repo for a project via service-role (bypasses RLS). */
export async function getRepoCoords(projectId: string): Promise<RepoCoords> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("id, workspace_id, gitea_repo_name, workspaces(gitea_org_name)")
    .eq("id", projectId)
    .single();
  if (error || !data) {
    throw new ApiError(404, `Project ${projectId} not found`);
  }
  const ws = (data as { workspaces?: { gitea_org_name?: string } }).workspaces;
  const org = ws?.gitea_org_name;
  if (!org) throw new ApiError(500, "Project workspace missing gitea_org_name");
  return {
    projectId: data.id as string,
    workspaceId: data.workspace_id as string,
    org,
    repo: data.gitea_repo_name as string,
  };
}

/**
 * Resolve the active edit branch for a project. If an active edit_session
 * exists, its tmp-* branch is used; otherwise falls back to the requested
 * branch (defaulting to `test`). The optional `requested` lets callers honor a
 * branch chosen in the UI's branch switcher.
 */
export async function resolveActiveBranch(
  projectId: string,
  requested?: string | null,
): Promise<string> {
  if (requested && (requested === "main" || requested === "test" || requested.startsWith("tmp-"))) {
    return requested;
  }
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("edit_sessions")
    .select("branch_name")
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.branch_name as string | undefined) ?? "test";
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
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  commitSha?: string;
}): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("audit_log").insert({
      workspace_id: entry.workspaceId,
      user_id: entry.userId ?? null,
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
  if (!user) throw new ApiError(401, "Authentication required");
  return { id: user.id, email: user.email ?? undefined };
}

/** A simple slugify used for tags / public slugs / branch names. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

/** Random url-safe slug for public sharing. */
export function randomSlug(len = 10): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
