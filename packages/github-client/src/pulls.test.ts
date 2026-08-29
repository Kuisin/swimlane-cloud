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
  head: { ref: head },
  base: { ref: base },
  html_url: "https://github.com/o/r/pull/7",
  draft: false,
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
