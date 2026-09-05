import { describe, expect, it, vi } from "vitest";
import { createRestClient } from "./rest.ts";
import { createWriteApi } from "./write.ts";
import { GitLabConflictError } from "./errors.ts";
import type { FetchImpl } from "./types.ts";

const ORIGIN = "https://gitlab.example.com/api/v4";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

function writeApi(fetchImpl: FetchImpl, projectId: number | string = 42) {
  return createWriteApi(createRestClient({ origin: ORIGIN, fetchImpl }), projectId);
}

describe("ensureBranch", () => {
  it("is a no-op when the branch already exists", async () => {
    const fetchImpl = vi.fn(async () => json({ commit: { id: "sha1" } }));
    await writeApi(fetchImpl as unknown as FetchImpl).ensureBranch("preview", "main");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("creates the branch when refSha 404s first", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return json({}, { status: 404 });
      return json({ commit: { id: "sha1" } });
    });
    const api = writeApi(fetchImpl as unknown as FetchImpl);
    await api.ensureBranch("preview", "main");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].method).toBe("POST");
  });

  it("treats GitLab's 'branch already exists' 400 as success", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return json({}, { status: 404 });
      return json({ message: "Branch already exists" }, { status: 400 });
    });
    const api = writeApi(fetchImpl as unknown as FetchImpl);
    await expect(api.ensureBranch("preview", "main")).resolves.toBeUndefined();
  });
});

describe("createBranchAtSha", () => {
  it("passes the sha as ref — GitLab accepts any revision there", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain("ref=abc123");
      return json({ commit: { id: "abc123" } });
    });
    const api = writeApi(fetchImpl as unknown as FetchImpl);
    await expect(api.createBranchAtSha("release-x", "abc123")).resolves.toBeUndefined();
  });

  it("treats GitLab's 'branch already exists' 400 as success", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ message: "Branch already exists" }, { status: 400 }),
    );
    const api = writeApi(fetchImpl as unknown as FetchImpl);
    await expect(api.createBranchAtSha("release-x", "abc123")).resolves.toBeUndefined();
  });
});

describe("tagExists", () => {
  it("is true when the tag resolves", async () => {
    const fetchImpl = vi.fn(async () => json({ name: "v1.0.0" }));
    const api = writeApi(fetchImpl as unknown as FetchImpl);
    await expect(api.tagExists("v1.0.0")).resolves.toBe(true);
  });

  it("is false on a 404, not an error", async () => {
    const fetchImpl = vi.fn(async () => json({}, { status: 404 }));
    const api = writeApi(fetchImpl as unknown as FetchImpl);
    await expect(api.tagExists("v1.0.0")).resolves.toBe(false);
  });
});

describe("commitFiles", () => {
  const branchesTreeSequence = (tree: Array<{ path: string; type: string }>) =>
    vi.fn(async (url: string) => {
      if (url.includes("/repository/branches?per_page=1")) return json([{ name: "main" }]);
      if (url.includes("/repository/branches/")) return json({ commit: { id: "head-sha" } });
      if (url.includes("/repository/tree")) return json(tree);
      return json({ id: "new-commit-sha" });
    });

  it("tags an existing path 'update' and a new path 'create'", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/repository/branches?per_page=1")) return json([{ name: "main" }]);
      if (url.includes("/repository/branches/")) return json({ commit: { id: "head-sha" } });
      if (url.includes("/repository/tree")) return json([{ path: "a.txt", type: "blob" }]);
      calls.push({ url, body: JSON.parse(init!.body as string) });
      return json({ id: "new-commit-sha" });
    });
    const api = writeApi(fetchImpl as unknown as FetchImpl);
    const result = await api.commitFiles({
      branch: "main",
      message: "update",
      files: [
        { path: "a.txt", text: "changed" },
        { path: "b.txt", text: "new" },
      ],
      deletions: ["c.txt"],
    });
    expect(result).toEqual({ sha: "new-commit-sha", branch: "main" });
    const actions = (calls[0]!.body as { actions: Array<{ action: string; file_path: string }> })
      .actions;
    expect(actions).toEqual(
      expect.arrayContaining([
        { action: "update", file_path: "a.txt", content: "changed" },
        { action: "create", file_path: "b.txt", content: "new" },
        { action: "delete", file_path: "c.txt" },
      ]),
    );
  });

  it("skips the tree lookup entirely on a project with no branches yet", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/repository/branches?per_page=1")) return json([]);
      return json({ id: "first-commit-sha" });
    });
    const api = writeApi(fetchImpl as unknown as FetchImpl);
    const result = await api.commitFiles({
      branch: "main",
      message: "seed",
      files: [{ path: "a.txt", text: "hello" }],
    });
    expect(result.sha).toBe("first-commit-sha");
    // Only the branch-existence probe and the commit call — no tree lookup.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws GitLabConflictError when expectedHeadSha has moved on", async () => {
    const fetchImpl = branchesTreeSequence([]);
    const api = writeApi(fetchImpl as unknown as FetchImpl);
    await expect(
      api.commitFiles({
        branch: "main",
        message: "x",
        files: [{ path: "a.txt", text: "x" }],
        expectedHeadSha: "stale-sha",
      }),
    ).rejects.toBeInstanceOf(GitLabConflictError);
  });
});

describe("readFile", () => {
  it("returns the raw file body", async () => {
    const fetchImpl = vi.fn(async () => new Response("diagram text", { status: 200, headers: {} }));
    const api = writeApi(fetchImpl as unknown as FetchImpl);
    expect(await api.readFile("a.txt", "main")).toBe("diagram text");
  });

  it("returns null on a missing path instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));
    const api = writeApi(fetchImpl as unknown as FetchImpl);
    await expect(api.readFile("missing.txt", "main")).resolves.toBeNull();
  });
});

describe("listTree", () => {
  it("maps GitLab's tree entries to the shared TreeEntry shape", async () => {
    const fetchImpl = vi.fn(async () =>
      json([
        { path: "a.txt", type: "blob", id: "sha-a" },
        { path: "dir", type: "tree", id: "sha-dir" },
      ]),
    );
    const api = writeApi(fetchImpl as unknown as FetchImpl);
    const { entries } = await api.listTree("main");
    expect(entries).toEqual([
      { path: "a.txt", type: "blob", sha: "sha-a" },
      { path: "dir", type: "tree", sha: "sha-dir" },
    ]);
  });
});
