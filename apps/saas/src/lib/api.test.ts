import { describe, expect, it } from "vitest";
import {
  GitHubConflictError,
  GitHubNotAccessibleError,
  GitHubRateLimitError,
  MergeTargetError,
} from "@swimlane-cloud/github-client";
import { GitLabConflictError, GitLabNotImplementedError } from "@swimlane-cloud/gitlab-client";
import { ApiError, errorResponse, withApi } from "./api";

describe("errorResponse", () => {
  it("merges ApiError extras into the body so clients can branch on flags", async () => {
    const res = errorResponse(new ApiError(409, "branch is locked", { locked: true }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "branch is locked", locked: true });
  });

  it("maps the GitHub taxonomy onto statuses", async () => {
    expect(errorResponse(new MergeTargetError("no")).status).toBe(400);
    expect(errorResponse(new GitHubConflictError("moved")).status).toBe(409);
    expect(await errorResponse(new GitHubConflictError("moved")).json()).toMatchObject({
      conflict: true,
    });
    const limited = errorResponse(new GitHubRateLimitError("slow down", { retryAfterSeconds: 30 }));
    expect(limited.status).toBe(503);
    expect(limited.headers.get("Retry-After")).toBe("30");
  });

  it("turns a dead token (401) into a sign-in prompt, and a 404 into not-found", async () => {
    const dead = errorResponse(
      new GitHubNotAccessibleError("rejected", { status: 401, authWouldHelp: true }),
    );
    expect(dead.status).toBe(401);
    expect(await dead.json()).toMatchObject({ needsAuth: true });

    const missing = errorResponse(new GitHubNotAccessibleError("nope", { status: 404 }));
    expect(missing.status).toBe(404);
  });

  it("never leaks a stack: unknown errors become a 500 with the message only", async () => {
    const res = errorResponse(new Error("boom"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });

  it("maps GitLab's error taxonomy the same way as GitHub's", async () => {
    expect(errorResponse(new GitLabConflictError("moved")).status).toBe(409);
    expect(await errorResponse(new GitLabConflictError("moved")).json()).toMatchObject({
      conflict: true,
    });
  });

  it("turns a not-yet-implemented GitLab method into a plain 400, not a crash", async () => {
    const res = errorResponse(
      new GitLabNotImplementedError("Merge requests are not available yet."),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Merge requests are not available yet." });
  });
});

describe("withApi", () => {
  it("passes a successful response through untouched", async () => {
    const handler = withApi(async () => new Response("ok", { status: 201 }));
    const res = await handler(new Request("http://x"), {});
    expect(res.status).toBe(201);
  });

  it("catches thrown errors", async () => {
    const handler = withApi(async () => {
      throw new ApiError(402, "upgrade", { upgrade: true });
    });
    const res = await handler(new Request("http://x"), {});
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: "upgrade", upgrade: true });
  });
});
