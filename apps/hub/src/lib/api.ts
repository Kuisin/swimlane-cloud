/**
 * Shared plumbing for the /api/repo routes.
 *
 * Deliberately NOT modelled on `apps/saas/src/lib/api.ts`: that module's
 * `ApiError` is what couples the Gitea client to `next/server` and makes it
 * unusable outside Next. Keeping this local to the app, and out of
 * `packages/github-client`, is the whole point.
 */

import { NextResponse } from "next/server";
import {
  GitHubConflictError,
  GitHubNotAccessibleError,
  GitHubRateLimitError,
  GitHubSsoError,
  MergeTargetError,
  createPullsApi,
  createRestClient,
  createWriteApi,
  type PullsApi,
  type RestClient,
  type WriteApi,
} from "@swimlane-cloud/github-client";
import { assertOwnerAllowed, assertOwnerRepo, BadRequestError } from "@/lib/guard";
import { getSession } from "@/lib/repo";

export interface RepoApis {
  rest: RestClient;
  write: WriteApi;
  pulls: PullsApi;
  login: string;
}

export class UnauthorizedError extends Error {}

/**
 * Every write path requires a signed-in user. There is no service account and
 * no bot token anywhere in this app — a write happens as the person who asked
 * for it, and GitHub's own permissions are the only authorisation model.
 */
export async function requireRepoApis(owner: string, repo: string): Promise<RepoApis> {
  assertOwnerRepo(owner, repo);
  assertOwnerAllowed(owner);

  const session = await getSession();
  if (!session) throw new UnauthorizedError("Sign in with GitHub to edit diagrams.");

  const rest = createRestClient({
    getToken: () => session.token,
    // Never cache a per-user response in a shared cache.
    fetchImpl: (url, init) => fetch(url, { ...init, cache: "no-store" }),
  });
  const ref = { owner, repo };
  return {
    rest,
    write: createWriteApi(rest, ref),
    pulls: createPullsApi(rest, ref),
    login: session.login,
  };
}

/** Maps the client's error taxonomy onto status codes, once, in one place. */
export function toResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message, needsAuth: true }, { status: 401 });
  }
  if (err instanceof BadRequestError || err instanceof MergeTargetError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof GitHubSsoError) {
    return NextResponse.json(
      { error: err.message, authorizeUrl: err.authorizeUrl, organizations: err.organizations },
      { status: 403 },
    );
  }
  if (err instanceof GitHubConflictError) {
    return NextResponse.json({ error: err.message, conflict: true }, { status: 409 });
  }
  if (err instanceof GitHubRateLimitError) {
    const res = NextResponse.json({ error: err.message, rateLimited: true }, { status: 503 });
    if (err.retryAfterSeconds) res.headers.set("Retry-After", String(err.retryAfterSeconds));
    return res;
  }
  if (err instanceof GitHubNotAccessibleError) {
    return NextResponse.json({ error: err.message, needsAuth: err.authWouldHelp }, { status: 404 });
  }
  throw err;
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new BadRequestError("Expected a JSON body.");
  }
}
