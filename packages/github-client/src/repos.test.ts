import { describe, expect, it, vi } from "vitest";
import { createReposApi } from "./repos.ts";
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

const api = (fetchImpl: FetchImpl) => createReposApi(createRestClient({ fetchImpl }));

const rawRepo = (name: string, extra: Record<string, unknown> = {}) => ({
  id: 1,
  name,
  full_name: `o/${name}`,
  private: true,
  default_branch: "main",
  html_url: `https://github.com/o/${name}`,
  description: null,
  owner: { login: "o", id: 42, type: "User" },
  pushed_at: "2026-01-01T00:00:00Z",
  ...extra,
});

describe("listAccessibleRepos", () => {
  it("asks for every affiliation, so org repos reached via a team are included", async () => {
    const { fetchImpl, calls } = routed({ "/user/repos": [] });
    await api(fetchImpl).listAccessibleRepos();
    const url = new URL(calls[0]![0]);
    expect(url.searchParams.get("affiliation")).toBe("owner,collaborator,organization_member");
    expect(url.searchParams.get("per_page")).toBe("100");
  });

  it("filters by topic client-side from the inline topics array", async () => {
    // No search API involved: the search index lags minutes behind a topic
    // change, while /user/repos reflects it immediately.
    const { fetchImpl } = routed({
      "/user/repos": [
        rawRepo("a", { topics: ["swimlane", "docs"] }),
        rawRepo("b", { topics: ["docs"] }),
        rawRepo("c"),
      ],
    });
    const repos = await api(fetchImpl).listAccessibleRepos({ topic: "swimlane" });
    expect(repos.map((r) => r.name)).toEqual(["a"]);
  });

  it("maps permissions and treats missing ones as read-only", async () => {
    const { fetchImpl } = routed({
      "/user/repos": [
        rawRepo("a", { permissions: { admin: true, push: true, pull: true } }),
        rawRepo("b"),
      ],
    });
    const [a, b] = await api(fetchImpl).listAccessibleRepos();
    expect(a!.permissions).toEqual({ admin: true, push: true, pull: true });
    expect(b!.permissions).toEqual({ admin: false, push: false, pull: true });
  });

  it("classifies the owner type", async () => {
    const { fetchImpl } = routed({
      "/user/repos": [rawRepo("a", { owner: { login: "acme", id: 7, type: "Organization" } })],
    });
    const [a] = await api(fetchImpl).listAccessibleRepos();
    expect(a!.owner).toBe("acme");
    expect(a!.ownerId).toBe(7);
    expect(a!.ownerType).toBe("Organization");
  });
});

describe("createRepo", () => {
  it("creates under the user by default and under an org when asked", async () => {
    const { fetchImpl, calls } = routed({ "/repos": rawRepo("x"), "/user/repos": rawRepo("x") });
    await api(fetchImpl).createRepo({ name: "x" });
    expect(calls[0]![0]).toMatch(/\/user\/repos$/);
    await api(fetchImpl).createRepo({ name: "x", org: "acme" });
    expect(calls[1]![0]).toMatch(/\/orgs\/acme\/repos$/);
  });

  it("defaults to private + auto_init, since the Git Data API needs a HEAD to commit on", async () => {
    const { fetchImpl, calls } = routed({ "/user/repos": rawRepo("x") });
    await api(fetchImpl).createRepo({ name: "x" });
    const body = JSON.parse(calls[0]![1].body as string);
    expect(body).toMatchObject({ name: "x", private: true, auto_init: true });
  });
});

describe("topics", () => {
  it("addTopic preserves the existing list and is a no-op when present", async () => {
    const { fetchImpl, calls } = routed({ "/topics": { names: ["docs"] } });
    await api(fetchImpl).addTopic("o", "r", "swimlane");
    const put = calls.find(([, i]) => i.method === "PUT")!;
    expect(JSON.parse(put[1].body as string).names).toEqual(["docs", "swimlane"]);

    const { fetchImpl: f2, calls: c2 } = routed({ "/topics": { names: ["swimlane"] } });
    await api(f2).addTopic("o", "r", "swimlane");
    expect(c2.some(([, i]) => i.method === "PUT")).toBe(false);
  });
});

describe("deleteBranch", () => {
  it("issues DELETE on the ref", async () => {
    const { fetchImpl, calls } = routed({ "/git/refs/heads/": null });
    await api(fetchImpl).deleteBranch("o", "r", "tmp-u-e");
    expect(calls[0]![1].method).toBe("DELETE");
    expect(calls[0]![0]).toMatch(/\/git\/refs\/heads\/tmp-u-e$/);
  });

  it("treats an already-deleted branch as success", async () => {
    // GitHub answers 422 "Reference does not exist" — the state we wanted.
    const { fetchImpl } = routed(
      { "/git/refs/heads/": { message: "Reference does not exist" } },
      { "/git/refs/heads/": 422 },
    );
    await expect(api(fetchImpl).deleteBranch("o", "r", "gone")).resolves.toBeUndefined();
  });
});

describe("listBranches", () => {
  it("returns name, sha and protection", async () => {
    const { fetchImpl } = routed({
      "/branches": [{ name: "main", commit: { sha: "a".repeat(40) }, protected: true }],
    });
    expect(await api(fetchImpl).listBranches("o", "r")).toEqual([
      { name: "main", sha: "a".repeat(40), protected: true },
    ]);
  });
});

describe("getOrgMembership", () => {
  it("reports an active admin membership", async () => {
    const { fetchImpl } = routed({
      "/user/memberships/orgs/acme": { state: "active", role: "admin" },
    });
    expect(await api(fetchImpl).getOrgMembership("acme")).toEqual({
      state: "active",
      role: "admin",
    });
  });

  it("downgrades an unrecognised role to member rather than guessing", async () => {
    const { fetchImpl } = routed({
      "/user/memberships/orgs/acme": { state: "active", role: "billing_manager" },
    });
    expect(await api(fetchImpl).getOrgMembership("acme")).toEqual({
      state: "active",
      role: "member",
    });
  });

  it("treats no membership (404) as null, not an error", async () => {
    const { fetchImpl } = routed(
      { "/user/memberships/orgs/acme": { message: "Not Found" } },
      { "/user/memberships/orgs/acme": 404 },
    );
    expect(await api(fetchImpl).getOrgMembership("acme")).toBeNull();
  });
});
