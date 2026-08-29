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
  head: { ref: head, sha: "a".repeat(40) },
  base: { ref: base, sha: "b".repeat(40) },
  html_url: "https://github.com/o/r/pull/7",
  draft: false,
  user: { login: "kuisin" },
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

describe("listPullFiles", () => {
  it("returns only the diagram sources when an extension filter is given", async () => {
    const { fetchImpl } = routed({
      "/pulls/7/files": [
        { filename: "diagrams/a.txt", status: "modified", additions: 3, deletions: 1 },
        { filename: "src/app.ts", status: "modified", additions: 9, deletions: 0 },
        { filename: "diagrams/new.txt", status: "added", additions: 12, deletions: 0 },
      ],
    });
    const files = await api(fetchImpl).listPullFiles(7, { onlyExt: ".txt" });
    expect(files.map((f) => f.path)).toEqual(["diagrams/a.txt", "diagrams/new.txt"]);
    expect(files[1]!.status).toBe("added");
  });

  it("keeps the previous path for a rename, so the old version can still be read", async () => {
    const { fetchImpl } = routed({
      "/pulls/7/files": [
        {
          filename: "diagrams/new-name.txt",
          previous_filename: "diagrams/old-name.txt",
          status: "renamed",
          additions: 0,
          deletions: 0,
        },
      ],
    });
    const [f] = await api(fetchImpl).listPullFiles(7);
    expect(f).toMatchObject({ status: "renamed", previousPath: "diagrams/old-name.txt" });
  });

  it("normalises GitHub's other statuses to `modified`", async () => {
    const { fetchImpl } = routed({
      "/pulls/7/files": [{ filename: "a.txt", status: "changed", additions: 1, deletions: 1 }],
    });
    expect((await api(fetchImpl).listPullFiles(7))[0]!.status).toBe("modified");
  });
});

describe("getPullRequest", () => {
  it("exposes both commit shas, which the visual diff needs", async () => {
    const { fetchImpl } = routed({ "/pulls/7": rawPull("tmp-u-e", "test") });
    const pr = await api(fetchImpl).getPullRequest(7);
    expect(pr.headSha).toBe("a".repeat(40));
    expect(pr.baseSha).toBe("b".repeat(40));
    expect(pr.author).toBe("kuisin");
  });
});
