/**
 * Browser-side fetch wrapper for this app's own API routes.
 *
 * Every error body has the shape `{ error, ...flags }` (see `errorResponse`
 * in api.ts); the flags are lifted onto the thrown error so UI code can
 * branch — `needsAuth` sends the user to /login, `conflict` asks them to
 * reload, `locked` / `dirty` explain why a branch action was refused.
 */

export class ApiClientError extends Error {
  status: number;
  needsAuth: boolean;
  conflict: boolean;
  locked: boolean;
  dirty: boolean;
  upgrade: boolean;
  rateLimited: boolean;
  /** Set alongside `needsAuth` when the missing connection is GitLab, not GitHub. */
  provider?: "github" | "gitlab";
  /** Which GitLab instance to reconnect, when `provider === "gitlab"`. */
  instanceId?: string;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : `Request failed (${status})`);
    this.name = "ApiClientError";
    this.status = status;
    this.body = body;
    this.needsAuth = Boolean(body.needsAuth) || status === 401;
    this.conflict = Boolean(body.conflict);
    this.locked = Boolean(body.locked);
    this.dirty = Boolean(body.dirty);
    this.upgrade = Boolean(body.upgrade);
    this.rateLimited = Boolean(body.rateLimited);
    if (body.provider === "github" || body.provider === "gitlab") this.provider = body.provider;
    if (typeof body.instanceId === "string") this.instanceId = body.instanceId;
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiClientError(res.status, body);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const postJson = <T>(url: string, body: unknown): Promise<T> =>
  api<T>(url, { method: "POST", body: JSON.stringify(body) });

export const patchJson = <T>(url: string, body: unknown): Promise<T> =>
  api<T>(url, { method: "PATCH", body: JSON.stringify(body) });

export const del = <T>(url: string): Promise<T> => api<T>(url, { method: "DELETE" });

/** Sends the user to sign in again, preserving where they were. */
export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(next)}&error=needsAuth`);
}

/** Sends the user through the GitLab connect flow, preserving where they were. */
export function redirectToGitLabConnect(instanceId: string): void {
  if (typeof window === "undefined") return;
  const next = window.location.pathname + window.location.search;
  window.location.assign(
    `/api/gitlab/connect?instanceId=${encodeURIComponent(instanceId)}&next=${encodeURIComponent(next)}`,
  );
}

/** Routes a `needsAuth` error to the right reconnect flow for its provider. */
export function redirectToReconnect(err: ApiClientError): void {
  if (err.provider === "gitlab" && err.instanceId) {
    redirectToGitLabConnect(err.instanceId);
    return;
  }
  redirectToLogin();
}
