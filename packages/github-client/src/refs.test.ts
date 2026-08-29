import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { lsRefs, parseLsRefs, parseRefLine } from "./refs.ts";
import { GitHubNotAccessibleError, GitHubRateLimitError } from "./errors.ts";
import type { FetchImpl } from "./types.ts";

/**
 * A byte-for-byte capture of a real protocol-v2 `ls-refs` response from
 * `github.com/facebook/react.git`. Recorded so the suite exercises GitHub's
 * actual wire output while running with no network in CI.
 */
const FIXTURE = new Uint8Array(
  readFileSync(fileURLToPath(new URL("./__fixtures__/ls-refs-react.bin", import.meta.url))),
);

function respond(
  body: Uint8Array,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  const fetchImpl = vi.fn(
    async () =>
      new Response(body as unknown as BodyInit, {
        status: init.status ?? 200,
        headers: init.headers ?? {},
      }),
  );
  return fetchImpl as unknown as FetchImpl & { mock: { calls: unknown[][] } };
}

describe("parseRefLine", () => {
  it("reads the default branch out of HEAD's symref-target", () => {
    const e = parseRefLine(
      "2dc7da790d6388b95b83198ca9b588b2ad5f5c0b HEAD symref-target:refs/heads/main",
    );
    expect(e?.ref).toBe("HEAD");
    expect(e?.symrefTarget).toBe("refs/heads/main");
  });

  it("peels an annotated tag to its commit sha", () => {
    const e = parseRefLine(
      "8481b1c7116eb68e2a1d65ee638aad3f4ce0a5ce refs/tags/v19.0.1 peeled:bbed0b0ee64b89353a40d6313037bbc80221bc3d",
    );
    // The tag object's own sha is NOT a commit; `peeled` is what /t/{tag} must
    // canonicalise to, otherwise the sha cannot be read as a tree.
    expect(e?.sha).toBe("8481b1c7116eb68e2a1d65ee638aad3f4ce0a5ce");
    expect(e?.peeled).toBe("bbed0b0ee64b89353a40d6313037bbc80221bc3d");
    expect(e?.name).toBe("v19.0.1");
  });

  it("leaves peeled unset for a lightweight tag", () => {
    expect(
      parseRefLine("36208507d59e5798513325ce94b401537bd5a780 refs/tags/v19.0.7")?.peeled,
    ).toBeUndefined();
  });

  it("ignores lines that are not ref advertisements", () => {
    expect(parseRefLine("# service=git-upload-pack")).toBeNull();
    expect(parseRefLine("")).toBeNull();
  });
});

describe("parseLsRefs against a recorded GitHub response", () => {
  const result = parseLsRefs(FIXTURE);

  it("recovers the default branch with no REST call", () => {
    expect(result.defaultBranch).toBe("main");
  });

  it("reports HEAD's sha and keeps HEAD out of the ref list", () => {
    expect(result.headSha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.refs.some((r) => r.ref === "HEAD")).toBe(false);
  });

  it("returns the branch the ref-prefix asked for", () => {
    expect(result.refs.find((r) => r.ref === "refs/heads/main")?.sha).toBe(result.headSha);
  });

  it("returns tags with short names and peels the annotated ones", () => {
    const tags = result.refs.filter((r) => r.ref.startsWith("refs/tags/"));
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((t) => !t.name.includes("/"))).toBe(true);
    expect(tags.some((t) => t.peeled)).toBe(true);
  });
});

describe("lsRefs", () => {
  it("selects protocol v2 — without the header GitHub answers v1 and ignores ref-prefix", async () => {
    const fetchImpl = respond(FIXTURE);
    await lsRefs({ owner: "facebook", repo: "react" }, { fetchImpl });
    const [url, init] = (fetchImpl as never as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!;
    expect(url).toBe("https://github.com/facebook/react.git/git-upload-pack");
    expect((init.headers as Record<string, string>)["Git-Protocol"]).toBe("version=2");
    expect(init.method).toBe("POST");
  });

  it("sends peel, symrefs and every requested ref-prefix", async () => {
    const fetchImpl = respond(FIXTURE);
    await lsRefs({ owner: "o", repo: "r" }, { fetchImpl, refPrefixes: ["refs/heads/main"] });
    const [, init] = (fetchImpl as never as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!;
    const body = new TextDecoder().decode(init.body as Uint8Array);
    expect(body).toContain("command=ls-refs");
    expect(body).toContain("peel");
    expect(body).toContain("symrefs");
    expect(body).toContain("ref-prefix refs/heads/main");
    expect(body.endsWith("0000")).toBe(true);
  });

  it("stays anonymous unless a token is supplied", async () => {
    const anon = respond(FIXTURE);
    await lsRefs({ owner: "o", repo: "r" }, { fetchImpl: anon });
    const [, anonInit] = (anon as never as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!;
    expect((anonInit.headers as Record<string, string>).Authorization).toBeUndefined();

    const authed = respond(FIXTURE);
    await lsRefs({ owner: "o", repo: "r" }, { fetchImpl: authed, token: "t0k" });
    const [, authInit] = (authed as never as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!;
    expect((authInit.headers as Record<string, string>).Authorization).toBe("Bearer t0k");
  });

  it("maps 401 to a not-accessible error that says auth would help", async () => {
    // Measured: an anonymous request for a private repo answers 401 here,
    // not the 404 the REST API returns.
    const fetchImpl = respond(new Uint8Array(), {
      status: 401,
      headers: { "www-authenticate": 'Basic realm="GitHub"' },
    });
    const err = await lsRefs({ owner: "o", repo: "r" }, { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(GitHubNotAccessibleError);
    expect((err as GitHubNotAccessibleError).authWouldHelp).toBe(true);
  });

  it("does not claim auth would help when a token was already supplied", async () => {
    const fetchImpl = respond(new Uint8Array(), { status: 401 });
    const err = await lsRefs({ owner: "o", repo: "r" }, { fetchImpl, token: "t" }).catch((e) => e);
    expect((err as GitHubNotAccessibleError).authWouldHelp).toBe(false);
  });

  it("treats 403 + Retry-After as throttling, not as a missing repo", async () => {
    // The git endpoints publish no x-ratelimit-* headers, so a secondary rate
    // limit is only visible as this.
    const fetchImpl = respond(new Uint8Array(), { status: 403, headers: { "retry-after": "60" } });
    const err = await lsRefs({ owner: "o", repo: "r" }, { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(GitHubRateLimitError);
    expect((err as GitHubRateLimitError).retryAfterSeconds).toBe(60);
  });

  it("maps 429 to throttling", async () => {
    const fetchImpl = respond(new Uint8Array(), { status: 429, headers: { "retry-after": "5" } });
    await expect(lsRefs({ owner: "o", repo: "r" }, { fetchImpl })).rejects.toBeInstanceOf(
      GitHubRateLimitError,
    );
  });
});
