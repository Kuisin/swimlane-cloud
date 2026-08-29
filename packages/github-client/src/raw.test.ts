import { describe, expect, it, vi } from "vitest";
import { rawFile, rawUrl } from "./raw.ts";
import { GitHubNotAccessibleError, GitHubProtocolError, GitHubRateLimitError } from "./errors.ts";
import type { FetchImpl } from "./types.ts";

const repo = { owner: "facebook", repo: "react" };

function respond(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  return vi.fn(
    async () => new Response(body, { status: init.status ?? 200, headers: init.headers ?? {} }),
  ) as unknown as FetchImpl;
}

describe("rawUrl", () => {
  it("builds the sha-addressed CDN path", () => {
    expect(rawUrl(repo, "abc123", "diagrams/flow.txt")).toBe(
      "https://raw.githubusercontent.com/facebook/react/abc123/diagrams/flow.txt",
    );
  });

  it("encodes each segment but keeps the separators", () => {
    expect(rawUrl(repo, "main", "ops/新規 登録.txt")).toBe(
      "https://raw.githubusercontent.com/facebook/react/main/ops/%E6%96%B0%E8%A6%8F%20%E7%99%BB%E9%8C%B2.txt",
    );
  });

  it("tolerates a leading slash", () => {
    expect(rawUrl(repo, "main", "/a.txt")).toContain("/main/a.txt");
  });
});

describe("rawFile", () => {
  it("returns the text and the ref it was read at", async () => {
    const blob = await rawFile(repo, "abc", "a.txt", { fetchImpl: respond("/title/ Hello") });
    expect(blob).toEqual({ text: "/title/ Hello", at: "abc", path: "a.txt" });
  });

  it("returns null for 404 — a path absent at an older tag is normal, not an error", async () => {
    expect(
      await rawFile(repo, "abc", "gone.txt", { fetchImpl: respond("", { status: 404 }) }),
    ).toBeNull();
  });

  it("says auth would help on 403, since the CDN takes no credentials", async () => {
    const err = await rawFile(repo, "abc", "a.txt", {
      fetchImpl: respond("", { status: 403 }),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(GitHubNotAccessibleError);
    expect((err as GitHubNotAccessibleError).authWouldHelp).toBe(true);
  });

  it("treats 403 + Retry-After as throttling rather than a permission problem", async () => {
    const fetchImpl = respond("", { status: 403, headers: { "retry-after": "30" } });
    const err = await rawFile(repo, "abc", "a.txt", { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(GitHubRateLimitError);
    expect((err as GitHubRateLimitError).retryAfterSeconds).toBe(30);
  });

  it("refuses an oversized file by declared length, before reading the body", async () => {
    const fetchImpl = respond("x", { headers: { "content-length": "9999999" } });
    await expect(
      rawFile(repo, "abc", "big.txt", { fetchImpl, maxBytes: 100 }),
    ).rejects.toBeInstanceOf(GitHubProtocolError);
  });

  it("refuses an oversized file that lied about its length", async () => {
    await expect(
      rawFile(repo, "abc", "big.txt", { fetchImpl: respond("x".repeat(500)), maxBytes: 100 }),
    ).rejects.toThrow(/exceeds/);
  });
});
