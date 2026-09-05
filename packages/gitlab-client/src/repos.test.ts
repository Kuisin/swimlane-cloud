import { describe, expect, it, vi } from "vitest";
import { createRestClient } from "./rest.ts";
import { createProjectsApi } from "./repos.ts";
import type { FetchImpl } from "./types.ts";

const ORIGIN = "https://gitlab.example.com/api/v4";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

function client(fetchImpl: FetchImpl) {
  const rest = createRestClient({ origin: ORIGIN, fetchImpl });
  return { rest, repos: createProjectsApi(rest) };
}

const RAW_PROJECT = {
  id: 42,
  name: "diagrams",
  path_with_namespace: "acme/diagrams",
  visibility: "private",
  default_branch: "main",
  web_url: "https://gitlab.example.com/acme/diagrams",
  description: null,
  topics: ["swimlane"],
  permissions: { project_access: { access_level: 40 }, group_access: null },
  namespace: { id: 7, full_path: "acme", kind: "group" },
  last_activity_at: "2026-01-01T00:00:00Z",
};

describe("getRepo", () => {
  it("maps a GitLab project to RepoInfo, deriving owner from path_with_namespace", async () => {
    const fetchImpl = vi.fn(async () => json(RAW_PROJECT));
    const { repos } = client(fetchImpl as unknown as FetchImpl);
    const info = await repos.getRepo(42);
    expect(info).toMatchObject({
      id: 42,
      owner: "acme",
      name: "diagrams",
      fullName: "acme/diagrams",
      defaultBranch: "main",
      topics: ["swimlane"],
    });
  });

  it("maps access_level 40 (Maintainer) to admin, 30 (Developer) to push-only", async () => {
    const maintainer = { ...RAW_PROJECT, permissions: { project_access: { access_level: 40 } } };
    const developer = { ...RAW_PROJECT, permissions: { project_access: { access_level: 30 } } };

    const { repos: r1 } = client((async () => json(maintainer)) as unknown as FetchImpl);
    expect((await r1.getRepo(42)).permissions).toEqual({ admin: true, push: true, pull: true });

    const { repos: r2 } = client((async () => json(developer)) as unknown as FetchImpl);
    expect((await r2.getRepo(42)).permissions).toEqual({ admin: false, push: true, pull: true });
  });

  it("URL-encodes a namespace/path project reference", async () => {
    const fetchImpl = vi.fn(async (_url: string) => json(RAW_PROJECT));
    const { repos } = client(fetchImpl as unknown as FetchImpl);
    await repos.getRepo("acme/diagrams");
    expect(fetchImpl.mock.calls[0]![0]).toContain(encodeURIComponent("acme/diagrams"));
  });
});

describe("addTopic", () => {
  it("reads current topics then PUTs the union", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method !== "PUT") return json(RAW_PROJECT);
      const body = JSON.parse(init.body as string) as { topics: string[] };
      return json({ ...RAW_PROJECT, topics: body.topics });
    });
    const { repos } = client(fetchImpl as unknown as FetchImpl);
    const result = await repos.addTopic(42, "swimlane-new");
    expect(result).toEqual(["swimlane", "swimlane-new"]);
    expect(calls[1]).toMatch(/^PUT /);
  });

  it("is a no-op when the topic is already present", async () => {
    const fetchImpl = vi.fn(async () => json(RAW_PROJECT));
    const { repos } = client(fetchImpl as unknown as FetchImpl);
    const result = await repos.addTopic(42, "swimlane");
    expect(result).toEqual(["swimlane"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("listBranches", () => {
  it("maps commit.id to sha", async () => {
    const fetchImpl = vi.fn(async () =>
      json([{ name: "main", commit: { id: "abc123" }, protected: true }]),
    );
    const { repos } = client(fetchImpl as unknown as FetchImpl);
    expect(await repos.listBranches(42)).toEqual([
      { name: "main", sha: "abc123", protected: true },
    ]);
  });
});

describe("deleteBranch", () => {
  it("treats a 404 as success (idempotent)", async () => {
    const fetchImpl = vi.fn(async () => json({}, { status: 404 }));
    const { repos } = client(fetchImpl as unknown as FetchImpl);
    await expect(repos.deleteBranch(42, "gone")).resolves.toBeUndefined();
  });
});

describe("createRepo", () => {
  it("never sets initialize_with_readme — the seed commit creates the default branch", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      expect(body.initialize_with_readme).toBe(false);
      expect(body.namespace_id).toBe(7);
      return json(RAW_PROJECT);
    });
    const { repos } = client(fetchImpl as unknown as FetchImpl);
    await repos.createRepo({ name: "diagrams", namespaceId: 7 });
  });
});
