import { describe, expect, it, vi } from "vitest";
import { createWriteApi } from "./write.ts";
import { createRestClient } from "./rest.ts";
import { GitHubConflictError } from "./errors.ts";
import type { FetchImpl } from "./types.ts";

const repo = { owner: "o", repo: "r" };
const HEAD = "1".repeat(40);
const TREE = "2".repeat(40);
const NEW = "3".repeat(40);

type Call = [string, RequestInit];

/** Routes by URL suffix so a test only states the responses it cares about. */
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

function api(fetchImpl: FetchImpl) {
  return createWriteApi(createRestClient({ fetchImpl }), repo);
}

const happyRoutes = {
  "/git/ref/heads/": { object: { sha: HEAD } },
  "/git/commits/": { tree: { sha: TREE } },
  "/git/blobs": { sha: "b".repeat(40) },
  "/git/trees": { sha: "t".repeat(40) },
  "/git/commits": { sha: NEW },
  "/git/refs/heads/": { ref: "refs/heads/test" },
};

describe("commitFiles", () => {
  it("builds the tree on base_tree so untouched paths survive", async () => {
    // Without base_tree the commit would delete the rest of the repository.
    const { fetchImpl, calls } = routed(happyRoutes);
    await api(fetchImpl).commitFiles({
      branch: "test",
      message: "checkpoint",
      files: [{ path: "a.txt", text: "A" }],
    });
    const treeCall = calls.find(([u]) => u.endsWith("/git/trees"))!;
    expect(JSON.parse(treeCall[1].body as string).base_tree).toBe(TREE);
  });

  it("writes one blob per file and one commit for all of them", async () => {
    const { fetchImpl, calls } = routed(happyRoutes);
    const result = await api(fetchImpl).commitFiles({
      branch: "test",
      message: "checkpoint",
      files: [
        { path: "a.txt", text: "A" },
        { path: "b.txt", text: "B" },
        { path: "c.txt", text: "C" },
      ],
    });
    expect(calls.filter(([u]) => u.endsWith("/git/blobs"))).toHaveLength(3);
    expect(calls.filter(([u]) => u.endsWith("/git/commits"))).toHaveLength(1);
    expect(result.sha).toBe(NEW);
  });

  it("sends utf-8 blobs rather than base64, so the package needs no Buffer", async () => {
    const { fetchImpl, calls } = routed(happyRoutes);
    await api(fetchImpl).commitFiles({
      branch: "test",
      message: "m",
      files: [{ path: "a.txt", text: "日本語" }],
    });
    const blob = JSON.parse(calls.find(([u]) => u.endsWith("/git/blobs"))![1].body as string);
    expect(blob).toEqual({ content: "日本語", encoding: "utf-8" });
  });

  it("never force-updates the ref", async () => {
    // A rejected non-fast-forward is the entire concurrency safety net.
    const { fetchImpl, calls } = routed(happyRoutes);
    await api(fetchImpl).commitFiles({
      branch: "test",
      message: "m",
      files: [{ path: "a.txt", text: "A" }],
    });
    const patch = calls.find(([, i]) => i.method === "PATCH")!;
    expect(JSON.parse(patch[1].body as string).force).toBe(false);
  });

  it("refuses to write when the branch moved under us", async () => {
    const { fetchImpl, calls } = routed(happyRoutes);
    const err = await api(fetchImpl)
      .commitFiles({
        branch: "test",
        message: "m",
        files: [{ path: "a.txt", text: "A" }],
        expectedHeadSha: "9".repeat(40),
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(GitHubConflictError);
    expect(err.message).toMatch(/moved on/);
    // Nothing was written.
    expect(calls.filter(([u]) => u.endsWith("/git/blobs"))).toHaveLength(0);
  });

  it("explains a lost race without implying data loss", async () => {
    const { fetchImpl } = routed(happyRoutes, { "/git/refs/heads/": 409 });
    const err = await api(fetchImpl)
      .commitFiles({ branch: "test", message: "m", files: [{ path: "a.txt", text: "A" }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(GitHubConflictError);
    expect(err.message).toMatch(/Nothing was lost/);
  });

  it("rejects an empty file list instead of creating an empty commit", async () => {
    const { fetchImpl } = routed(happyRoutes);
    await expect(
      api(fetchImpl).commitFiles({ branch: "test", message: "m", files: [] }),
    ).rejects.toThrow(/no files/);
  });
});

describe("listTree", () => {
  it("surfaces truncation rather than silently returning a partial tree", async () => {
    const { fetchImpl } = routed({
      "/git/trees/": { tree: [{ path: "a.txt", type: "blob", sha: "s" }], truncated: true },
    });
    const out = await api(fetchImpl).listTree("f".repeat(40));
    expect(out.truncated).toBe(true);
    expect(out.entries).toHaveLength(1);
  });
});

describe("ensureBranch", () => {
  it("is a no-op when the branch already exists", async () => {
    const { fetchImpl, calls } = routed({ "/git/ref/heads/": { object: { sha: HEAD } } });
    await api(fetchImpl).ensureBranch("test", "main");
    expect(calls.some(([, i]) => i.method === "POST")).toBe(false);
  });
});
