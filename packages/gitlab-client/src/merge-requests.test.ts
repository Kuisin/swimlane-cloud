import { describe, expect, it, vi } from "vitest";
import { createRestClient } from "./rest.ts";
import { createMergeRequestsApi } from "./merge-requests.ts";
import { GitLabNotImplementedError } from "./errors.ts";
import type { FetchImpl } from "./types.ts";

const ORIGIN = "https://gitlab.example.com/api/v4";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

function mrApi(fetchImpl: FetchImpl) {
  return createMergeRequestsApi(createRestClient({ origin: ORIGIN, fetchImpl }), 42);
}

const RAW_MR = {
  iid: 7,
  title: "Edit diagram",
  state: "opened" as const,
  source_branch: "kai/20260905-120000/abc123",
  target_branch: "preview",
  web_url: "https://gitlab.example.com/acme/diagrams/-/merge_requests/7",
  author: { username: "kai" },
};

describe("listPullRequests", () => {
  it("maps iid to number and requests state=opened for 'open'", async () => {
    const fetchImpl = vi.fn(async (_url: string) => json([RAW_MR]));
    const prs = await mrApi(fetchImpl as unknown as FetchImpl).listPullRequests({ state: "open" });
    expect(prs).toEqual([
      expect.objectContaining({
        number: 7,
        head: "kai/20260905-120000/abc123",
        base: "preview",
        state: "open",
      }),
    ]);
    expect(fetchImpl.mock.calls[0]![0]).toContain("state=opened");
  });

  it("requests state=all and filters client-side for 'closed', since GitLab's closed excludes merged", async () => {
    const fetchImpl = vi.fn(async (_url: string) =>
      json([
        { ...RAW_MR, iid: 1, state: "closed" },
        { ...RAW_MR, iid: 2, state: "merged" },
      ]),
    );
    const prs = await mrApi(fetchImpl as unknown as FetchImpl).listPullRequests({
      state: "closed",
    });
    expect(fetchImpl.mock.calls[0]![0]).toContain("state=all");
    expect(prs.map((p) => p.number)).toEqual([1]);
  });
});

describe("stubbed write methods", () => {
  it("createPullRequest throws GitLabNotImplementedError", async () => {
    const api = mrApi((async () => json({})) as unknown as FetchImpl);
    await expect(
      api.createPullRequest({ head: "a", base: "preview", title: "t" }),
    ).rejects.toBeInstanceOf(GitLabNotImplementedError);
  });

  it("mergePullRequest throws GitLabNotImplementedError", async () => {
    const api = mrApi((async () => json({})) as unknown as FetchImpl);
    await expect(api.mergePullRequest(7)).rejects.toBeInstanceOf(GitLabNotImplementedError);
  });
});
