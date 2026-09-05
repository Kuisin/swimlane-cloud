import { describe, expect, it, vi } from "vitest";
import { createCommitsApi } from "./commits.ts";
import { createRestClient } from "./rest.ts";
import type { FetchImpl } from "./types.ts";

type Call = [string, RequestInit];

function routed(routes: Record<string, unknown>, status: Record<string, number> = {}) {
  const calls: Call[] = [];
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

const repo = { owner: "o", repo: "r" };
const api = (fetchImpl: FetchImpl) => createCommitsApi(createRestClient({ fetchImpl }), repo);

const SHA = "a".repeat(40);
const rawCommit = (sha = SHA) => ({
  sha,
  html_url: `https://github.com/o/r/commit/${sha}`,
  commit: { message: "Checkpoint", author: { name: "Kai", date: "2026-01-01T00:00:00Z" } },
  author: { login: "kuisin" },
  parents: [{ sha: "b".repeat(40) }],
});

describe("listCommits", () => {
  it("requests one page for the ref", async () => {
    const { fetchImpl, calls } = routed({ "/commits?": [rawCommit()] });
    const out = await api(fetchImpl).listCommits("test", { perPage: 5, page: 2 });
    const url = new URL(calls[0]![0]);
    expect(url.searchParams.get("sha")).toBe("test");
    expect(url.searchParams.get("per_page")).toBe("5");
    expect(url.searchParams.get("page")).toBe("2");
    expect(out[0]).toMatchObject({
      sha: SHA,
      message: "Checkpoint",
      author: { name: "Kai", login: "kuisin" },
    });
  });

  it("tolerates a commit whose email maps to no GitHub account", async () => {
    const { fetchImpl } = routed({ "/commits?": [{ ...rawCommit(), author: null }] });
    const [c] = await api(fetchImpl).listCommits("test");
    expect(c!.author.login).toBeNull();
    expect(c!.author.name).toBe("Kai");
  });
});

describe("compare", () => {
  const rawCompare = (status: string) => ({
    status,
    ahead_by: 2,
    behind_by: 0,
    merge_base_commit: { sha: "c".repeat(40) },
    files: [
      { filename: "diagrams/a.txt", status: "modified" },
      { filename: "diagrams/b.txt", status: "renamed", previous_filename: "diagrams/old.txt" },
    ],
    commits: [rawCommit()],
  });

  it("maps files, commits and the merge base", async () => {
    const { fetchImpl, calls } = routed({ "/compare/": rawCompare("ahead") });
    const out = await api(fetchImpl).compare("test", "tmp-u-e");
    expect(calls[0]![0]).toMatch(/\/compare\/test\.\.\.tmp-u-e$/);
    expect(out.mergeBaseSha).toBe("c".repeat(40));
    expect(out.files).toEqual([
      { path: "diagrams/a.txt", status: "modified" },
      { path: "diagrams/b.txt", status: "renamed", previousPath: "diagrams/old.txt" },
    ]);
    expect(out.commits[0]!.sha).toBe(SHA);
  });

  it("marks a sha-to-sha comparison immutable for the caller's cache", async () => {
    const { fetchImpl, calls } = routed({ "/compare/": rawCompare("identical") });
    await api(fetchImpl).compare(SHA, "b".repeat(40));
    expect((calls[0]![1] as { immutable?: boolean }).immutable).toBe(true);
    await api(fetchImpl).compare("test", SHA);
    expect((calls[1]![1] as { immutable?: boolean }).immutable).toBe(false);
  });
});

describe("isAncestor", () => {
  const rawCompare = (status: string) => ({
    status,
    ahead_by: 0,
    behind_by: 0,
    merge_base_commit: { sha: SHA },
    commits: [],
  });

  it("is true when the ref is ahead of or identical to the sha", async () => {
    expect(
      await api(routed({ "/compare/": rawCompare("ahead") }).fetchImpl).isAncestor(SHA, "test"),
    ).toBe(true);
    expect(
      await api(routed({ "/compare/": rawCompare("identical") }).fetchImpl).isAncestor(SHA, "test"),
    ).toBe(true);
  });

  it("is false when the sha is not on the ref", async () => {
    // `behind` = the sha has commits the ref lacks; `diverged` = both do.
    expect(
      await api(routed({ "/compare/": rawCompare("behind") }).fetchImpl).isAncestor(SHA, "test"),
    ).toBe(false);
    expect(
      await api(routed({ "/compare/": rawCompare("diverged") }).fetchImpl).isAncestor(SHA, "test"),
    ).toBe(false);
  });

  it("treats 'no common history' (404) as false rather than an error", async () => {
    const { fetchImpl } = routed(
      { "/compare/": { message: "No common ancestor" } },
      { "/compare/": 404 },
    );
    expect(await api(fetchImpl).isAncestor(SHA, "test")).toBe(false);
  });
});
