import { describe, expect, it, vi } from "vitest";
import { createPullsApi } from "./pulls.ts";
import { createRestClient } from "./rest.ts";
import { MergeTargetError } from "./branch-model.ts";
import { GitHubConflictError } from "./errors.ts";
import type { FetchImpl } from "./types.ts";

const repo = { owner: "o", repo: "r" };

const rawPull = (head: string, base: string) => ({
  number: 7,
  title: "Edit diagrams",
  state: "open",
  merged_at: null,
  head: { ref: head, sha: "h".repeat(40) },
  base: { ref: base, sha: "b".repeat(40) },
  html_url: "https://github.com/o/r/pull/7",
  draft: false,
  user: { login: "kuisin" },
  created_at: "2026-01-01T00:00:00Z",
});

function routed(routes: Record<string, unknown>, status: Record<string, number> = {}) {
  const calls: Array<[string, RequestInit]> = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init ?? {}]);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response("no route", { status: 404 });
    return new Response(JSON.stringify(routes[key]), {
      status: status[key] ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as FetchImpl;
  return { fetchImpl, calls };
}

const api = (fetchImpl: FetchImpl) => createPullsApi(createRestClient({ fetchImpl }), repo);

describe("createPullRequest", () => {
  it("refuses tmp-* -> main BEFORE contacting GitHub", async () => {
    // A rejected PR still notifies reviewers and leaves a closed PR behind, so
    // the guard has to run client-side, not on the response.
    const { fetchImpl, calls } = routed({ "/pulls": rawPull("tmp-u-e", "main") });
    await expect(
      api(fetchImpl).createPullRequest({ head: "tmp-u-e", base: "main", title: "t" }),
    ).rejects.toBeInstanceOf(MergeTargetError);
    expect(calls).toHaveLength(0);
  });

  it("allows the sanctioned tmp-* -> test", async () => {
    const { fetchImpl } = routed({ "/pulls": rawPull("tmp-u-e", "test") });
    const pr = await api(fetchImpl).createPullRequest({
      head: "tmp-u-e",
      base: "test",
      title: "t",
    });
    expect(pr).toMatchObject({
      number: 7,
      head: "tmp-u-e",
      base: "test",
      merged: false,
      state: "open",
    });
  });

  it("allows the promotion test -> main", async () => {
    const { fetchImpl } = routed({ "/pulls": rawPull("test", "main") });
    await expect(
      api(fetchImpl).createPullRequest({ head: "test", base: "main", title: "release" }),
    ).resolves.toMatchObject({ base: "main" });
  });
});

describe("listPullRequests", () => {
  it("qualifies head with the owner, as GitHub requires", async () => {
    const { fetchImpl, calls } = routed({ "/pulls": [rawPull("tmp-u-e", "test")] });
    await api(fetchImpl).listPullRequests({ head: "tmp-u-e" });
    expect(calls[0]![0]).toContain(`head=${encodeURIComponent("o:tmp-u-e")}`);
  });
});

describe("mergePullRequest", () => {
  it("re-checks the merge target from the server, not the caller's claim", async () => {
    // Otherwise a PR retargeted to main after creation would merge happily.
    const { fetchImpl } = routed({ "/pulls/7": rawPull("tmp-u-e", "main") });
    await expect(api(fetchImpl).mergePullRequest(7)).rejects.toBeInstanceOf(MergeTargetError);
  });

  it("uses PUT with a merge_method", async () => {
    const { fetchImpl, calls } = routed({
      "/pulls/7/merge": { sha: "a".repeat(40), merged: true },
      "/pulls/7": rawPull("tmp-u-e", "test"),
    });
    await api(fetchImpl).mergePullRequest(7, { method: "squash" });
    const merge = calls.find(([u]) => u.endsWith("/merge"))!;
    expect(merge[1].method).toBe("PUT");
    expect(JSON.parse(merge[1].body as string).merge_method).toBe("squash");
  });

  it("turns a 409 into an actionable conflict message", async () => {
    const { fetchImpl } = routed(
      { "/pulls/7/merge": { message: "not mergeable" }, "/pulls/7": rawPull("tmp-u-e", "test") },
      { "/pulls/7/merge": 409 },
    );
    const err = await api(fetchImpl)
      .mergePullRequest(7)
      .catch((e) => e);
    expect(err).toBeInstanceOf(GitHubConflictError);
    expect(err.message).toMatch(/conflicts with test/);
  });
});

describe("pull request shape", () => {
  it("carries head/base shas and the author, which the SaaS state needs", async () => {
    const { fetchImpl } = routed({ "/pulls/7": { ...rawPull("tmp-u-e", "test"), comments: 3 } });
    const pr = await api(fetchImpl).getPullRequest(7);
    expect(pr).toMatchObject({
      headSha: "h".repeat(40),
      baseSha: "b".repeat(40),
      author: "kuisin",
      createdAt: "2026-01-01T00:00:00Z",
      commentCount: 3,
      mergedAt: null,
    });
  });
});

describe("closePullRequest", () => {
  it("PATCHes state=closed and never touches the merge endpoint", async () => {
    const { fetchImpl, calls } = routed({
      "/pulls/7": { ...rawPull("tmp-u-e", "test"), state: "closed", closed_at: "2026-01-02" },
    });
    const pr = await api(fetchImpl).closePullRequest(7);
    expect(calls[0]![1].method).toBe("PATCH");
    expect(JSON.parse(calls[0]![1].body as string)).toEqual({ state: "closed" });
    expect(calls.some(([u]) => u.endsWith("/merge"))).toBe(false);
    expect(pr.state).toBe("closed");
  });
});

describe("issue comments", () => {
  const rawComment = {
    id: 1,
    body: "Looks good",
    created_at: "2026-01-01T00:00:00Z",
    html_url: "https://github.com/o/r/pull/7#issuecomment-1",
    user: { login: "reviewer" },
  };

  it("reads the conversation from the issues endpoint, not the review thread", async () => {
    const { fetchImpl, calls } = routed({ "/issues/7/comments": [rawComment] });
    const out = await api(fetchImpl).listIssueComments(7);
    expect(calls[0]![0]).toContain("/issues/7/comments");
    expect(out).toEqual([
      {
        id: 1,
        author: "reviewer",
        body: "Looks good",
        createdAt: "2026-01-01T00:00:00Z",
        htmlUrl: rawComment.html_url,
      },
    ]);
  });

  it("posts a comment", async () => {
    const { fetchImpl, calls } = routed({ "/issues/7/comments": rawComment });
    await api(fetchImpl).createIssueComment(7, "Looks good");
    expect(calls[0]![1].method).toBe("POST");
    expect(JSON.parse(calls[0]![1].body as string)).toEqual({ body: "Looks good" });
  });
});
