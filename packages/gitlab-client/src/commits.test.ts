import { describe, expect, it, vi } from "vitest";
import { createRestClient } from "./rest.ts";
import { createCommitsApi } from "./commits.ts";
import type { FetchImpl } from "./types.ts";

const ORIGIN = "https://gitlab.example.com/api/v4";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

function commitsApi(fetchImpl: FetchImpl) {
  return createCommitsApi(createRestClient({ origin: ORIGIN, fetchImpl }), 42);
}

describe("compare", () => {
  it("derives 'ahead' from an empty reverse compare", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const forward = url.includes("from=main") && url.includes("to=feature");
      return json({
        commits: forward
          ? [{ id: "c1", message: "m", author_name: "a", authored_date: "d", parent_ids: [] }]
          : [],
        diffs: forward
          ? [
              {
                old_path: "a.txt",
                new_path: "a.txt",
                new_file: true,
                deleted_file: false,
                renamed_file: false,
              },
            ]
          : [],
      });
    });
    const result = await commitsApi(fetchImpl as unknown as FetchImpl).compare("main", "feature");
    expect(result.status).toBe("ahead");
    expect(result.aheadBy).toBe(1);
    expect(result.behindBy).toBe(0);
    expect(result.files).toEqual([{ path: "a.txt", status: "added" }]);
  });

  it("derives 'diverged' when both directions have commits", async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        commits: [{ id: "c1", message: "m", author_name: "a", authored_date: "d", parent_ids: [] }],
        diffs: [],
      }),
    );
    const result = await commitsApi(fetchImpl as unknown as FetchImpl).compare("main", "feature");
    expect(result.status).toBe("diverged");
    expect(result.aheadBy).toBe(1);
    expect(result.behindBy).toBe(1);
  });

  it("derives 'identical' when neither direction has commits", async () => {
    const fetchImpl = vi.fn(async () => json({ commits: [], diffs: [] }));
    const result = await commitsApi(fetchImpl as unknown as FetchImpl).compare("main", "main");
    expect(result.status).toBe("identical");
  });
});

describe("getCommit", () => {
  it("fetches the commit and its diff, mapping GitLab's new_file/deleted_file flags", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/diff")) {
        return json([
          {
            old_path: "a.txt",
            new_path: "a.txt",
            new_file: false,
            deleted_file: true,
            renamed_file: false,
          },
        ]);
      }
      return json({
        id: "sha1",
        message: "msg",
        author_name: "kai",
        authored_date: "2026-01-01T00:00:00Z",
        parent_ids: ["parent1"],
      });
    });
    const commit = await commitsApi(fetchImpl as unknown as FetchImpl).getCommit("sha1");
    expect(commit.sha).toBe("sha1");
    expect(commit.files).toEqual([{ path: "a.txt", status: "removed" }]);
  });
});
