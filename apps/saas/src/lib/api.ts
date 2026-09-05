import { NextResponse } from "next/server";
import {
  GitHubConflictError,
  GitHubNotAccessibleError,
  GitHubRateLimitError,
  GitHubSsoError,
  MergeTargetError,
} from "@swimlane-cloud/github-client";

/**
 * Typed HTTP error that route handlers may throw; mapped to a JSON response.
 * `extra` is merged into the body so the client can branch on flags such as
 * `needsAuth`, `conflict`, `locked`, `dirty` or `upgrade` without parsing text.
 */
export class ApiError extends Error {
  status: number;
  extra: Record<string, unknown>;
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.extra = extra;
  }
}

type Handler = (req: Request, ctx: any) => Promise<Response> | Response;

/**
 * Maps every error a handler can throw onto one JSON shape, once. The GitHub
 * client's taxonomy (mirrors `apps/hub/src/lib/api.ts`) lands here alongside
 * `ApiError`, so a route never needs its own try/catch.
 */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
  }
  if (err instanceof MergeTargetError) {
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
    // A 401 from GitHub means the stored token is dead (revoked, or the OAuth
    // app was removed); the fix is to sign in again, so say so.
    const status = err.status === 401 ? 401 : 404;
    return NextResponse.json({ error: err.message, needsAuth: err.authWouldHelp }, { status });
  }
  const message = err instanceof Error ? err.message : "Internal error";
  // Surface config errors (missing env) as 500 with a useful message.
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Wraps a route handler so thrown errors become JSON responses with the right status. */
export function withApi(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Convenience JSON success response. */
export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Parse the JSON body, throwing a 400 ApiError on malformed input. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}
