/**
 * Registering and claiming a self-hosted (or gitlab.com) GitLab instance.
 *
 * GitHub tells `apps/saas` a workspace's identity for free the first time
 * someone opens a repository (`discovery.ts:ensureWorkspace`, keyed by the
 * numeric owner id GitHub hands back). GitLab tells us nothing until an
 * admin has authenticated against their instance, so this is an explicit,
 * ordered three-step wizard instead of something that happens lazily:
 *
 *   1. registerGitLabInstance — an org admin pastes their OAuth Application's
 *      host + client id/secret; the row starts "unclaimed" (workspace_id null).
 *   2. the OAuth connect/callback round trip (see app/api/gitlab/connect,
 *      app/api/gitlab/callback) authenticates that admin against the instance.
 *   3. claimWorkspaceForInstance — the admin picks which GitLab group (where
 *      they hold Owner access) this workspace represents.
 */
import { ApiError } from "./api";
import { requireGitLabApis } from "./gitlab";
import { getServiceSupabase } from "./supabase/server";
import { openToken, sealToken } from "./token-crypto";

export interface GitLabInstanceRow {
  id: string;
  host: string;
  displayName: string;
  clientId: string;
  clientSecret: string;
  workspaceId: string | null;
}

/** `https://gitlab.example.com`, no trailing slash — validated, not just trimmed. */
export function normalizeGitLabHost(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+$/.test(trimmed)) {
    throw new ApiError(400, "host must look like https://gitlab.example.com, with no path.");
  }
  return trimmed;
}

export async function registerGitLabInstance(opts: {
  host: string;
  clientId: string;
  clientSecret: string;
  displayName: string;
  userId: string;
  login?: string;
}): Promise<{ instanceId: string }> {
  const host = normalizeGitLabHost(opts.host);
  if (!opts.clientId.trim()) throw new ApiError(400, "clientId is required");
  if (!opts.clientSecret.trim()) throw new ApiError(400, "clientSecret is required");
  if (!opts.displayName.trim()) throw new ApiError(400, "displayName is required");

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("gitlab_instances")
    .insert({
      host,
      display_name: opts.displayName.trim(),
      client_id: opts.clientId.trim(),
      client_secret_ciphertext: sealToken(opts.clientSecret.trim()),
      registered_by: opts.userId,
      registered_by_login: opts.login ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new ApiError(500, `gitlab_instances insert failed: ${error?.message}`);
  return { instanceId: data.id as string };
}

interface RawInstanceRow {
  id: string;
  host: string;
  display_name: string;
  client_id: string;
  client_secret_ciphertext: string;
  workspace_id: string | null;
  registered_by: string | null;
}

export async function getGitLabInstance(instanceId: string): Promise<GitLabInstanceRow | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("gitlab_instances")
    .select(
      "id, host, display_name, client_id, client_secret_ciphertext, workspace_id, registered_by",
    )
    .eq("id", instanceId)
    .maybeSingle();
  if (error) throw new ApiError(500, `gitlab_instances lookup failed: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as RawInstanceRow;
  const clientSecret = openToken(row.client_secret_ciphertext);
  if (!clientSecret) return null; // rotated TOKEN_ENCRYPTION_KEY — re-register will re-seal it
  return {
    id: row.id,
    host: row.host,
    displayName: row.display_name,
    clientId: row.client_id,
    clientSecret,
    workspaceId: row.workspace_id,
  };
}

/** True when `userId` is the admin who registered this (still-unclaimed) instance. */
export async function isInstanceRegisteredBy(instanceId: string, userId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("gitlab_instances")
    .select("registered_by")
    .eq("id", instanceId)
    .maybeSingle();
  return Boolean(data && data.registered_by === userId);
}

/** Groups the caller holds Owner access in on this instance — the claim/create picker. */
export async function listOwnedNamespaces(userId: string, instanceId: string) {
  const apis = await requireGitLabApis(userId, instanceId);
  return apis.repos.listOwnedNamespaces();
}

/**
 * Bind an unclaimed instance to a new workspace. Re-verifies the caller's
 * Owner-level access server-side — the namespace picker already filtered to
 * Owner-level groups, but a client-side filter is not a trust boundary.
 */
export async function claimWorkspaceForInstance(
  userId: string,
  instanceId: string,
  namespacePath: string,
): Promise<{ workspaceId: string }> {
  const instance = await getGitLabInstance(instanceId);
  if (!instance) throw new ApiError(404, "GitLab instance not found");
  if (instance.workspaceId) {
    throw new ApiError(409, "This instance is already connected to a workspace.");
  }

  const namespaces = await listOwnedNamespaces(userId, instanceId);
  const namespace = namespaces.find((n) => n.fullPath === namespacePath);
  if (!namespace) {
    throw new ApiError(403, `You do not have Owner access to ${namespacePath} on this instance.`);
  }

  const supabase = getServiceSupabase();
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .insert({
      provider: "gitlab",
      gitlab_instance_id: instanceId,
      gitlab_namespace_id: namespace.id,
      gitlab_namespace_path: namespace.fullPath,
      name: namespace.name,
    })
    .select("id")
    .single();
  if (error || !workspace) {
    // Same (instance, namespace) claimed twice in a race hits this unique
    // index — report it plainly rather than a raw constraint-violation message.
    if (error?.code === "23505") {
      throw new ApiError(409, `${namespacePath} is already connected to a workspace here.`);
    }
    throw new ApiError(500, `workspace insert failed: ${error?.message}`);
  }
  const workspaceId = workspace.id as string;

  const { error: claimErr } = await supabase
    .from("gitlab_instances")
    .update({ workspace_id: workspaceId, claimed_at: new Date().toISOString() })
    .eq("id", instanceId)
    .is("workspace_id", null);
  if (claimErr) {
    // Compensate: don't leave an orphaned workspace behind.
    await supabase.from("workspaces").delete().eq("id", workspaceId);
    throw new ApiError(500, `instance claim failed: ${claimErr.message}`);
  }

  return { workspaceId };
}
