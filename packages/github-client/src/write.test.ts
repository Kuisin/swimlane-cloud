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

  it("deletes a path with sha:null — omitting it would inherit it from base_tree", async () => {
    const { fetchImpl, calls } = routed(happyRoutes);
    await api(fetchImpl).commitFiles({
      branch: "test",
      message: "remove",
      files: [],
      deletions: ["diagrams/gone.txt"],
    });
    const tree = JSON.parse(calls.find(([u]) => u.endsWith("/git/trees"))![1].body as string);
    expect(tree.tree).toEqual([
      { path: "diagrams/gone.txt", mode: "100644", type: "blob", sha: null },
    ]);
    // A deletion alone is a real commit; no blob is written for it.
    expect(calls.filter(([u]) => u.endsWith("/git/blobs"))).toHaveLength(0);
  });

  it("carries writes and deletions in one commit", async () => {
    const { fetchImpl, calls } = routed(happyRoutes);
    await api(fetchImpl).commitFiles({
      branch: "test",
      message: "move",
      files: [{ path: "b.txt", text: "B" }],
      deletions: ["a.txt"],
    });
    const tree = JSON.parse(calls.find(([u]) => u.endsWith("/git/trees"))![1].body as string);
    expect(
      tree.tree.map((e: { path: string; sha: string | null }) => [e.path, e.sha === null]),
    ).toEqual([
      ["b.txt", false],
      ["a.txt", true],
    ]);
    expect(calls.filter(([u]) => u.endsWith("/git/commits"))).toHaveLength(1);
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

describe("createBranchAtSha", () => {
  it("treats an existing branch (409/422) as success", async () => {
    const { fetchImpl } = routed({ "/git/refs": {} }, { "/git/refs": 422 });
    await expect(api(fetchImpl).createBranchAtSha("release-abc", HEAD)).resolves.toBeUndefined();
  });
});

describe("tagExists", () => {
  it("is true when the tag ref resolves", async () => {
    const { fetchImpl } = routed({ "/git/ref/tags/": { object: { sha: HEAD } } });
    await expect(api(fetchImpl).tagExists("v1.0.0")).resolves.toBe(true);
  });

  it("is false on a 404, not an error", async () => {
    const { fetchImpl } = routed({ "/git/ref/tags/": {} }, { "/git/ref/tags/": 404 });
    await expect(api(fetchImpl).tagExists("v1.0.0")).resolves.toBe(false);
  });
});

describe("readFile", () => {
  it("returns the raw file body, encoding each path segment separately", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      // A literal `/` must survive as a path separator, not become %2F —
      // otherwise this would look for one oddly-named file, not a nested one.
      expect(url).toContain("/contents/dir/sub%20dir/a.txt");
      return new Response("diagram text", { status: 200 });
    }) as unknown as FetchImpl;
    expect(await api(fetchImpl).readFile("dir/sub dir/a.txt", "main")).toBe("diagram text");
  });

  it("returns null on a missing path instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 })) as unknown as FetchImpl;
    await expect(api(fetchImpl).readFile("missing.txt", "main")).resolves.toBeNull();
  });
});
