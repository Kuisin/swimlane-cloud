import { describe, expect, it, vi } from "vitest";
import { createRestClient, nextPageUrl } from "./rest.ts";
import { GitLabNotAccessibleError, GitLabRateLimitError } from "./errors.ts";
import type { EtagStore, FetchImpl } from "./types.ts";

const ORIGIN = "https://gitlab.example.com/api/v4";

type Call = [string, RequestInit];

/** Replays a script of responses, cloning each one (a body may only be read once). */
function scripted(responses: Response[]) {
  let i = 0;
  const fn = vi.fn(async () => responses[Math.min(i++, responses.length - 1)]!.clone());
  return fn as unknown as FetchImpl & { mock: { calls: Call[] } };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

describe("nextPageUrl", () => {
  it("picks rel=next out of a Link header", () => {
    const link = `<${ORIGIN}/x?page=2>; rel="next", <${ORIGIN}/x?page=9>; rel="last"`;
    expect(nextPageUrl(link)).toBe(`${ORIGIN}/x?page=2`);
  });

  it("returns null on the last page", () => {
    expect(nextPageUrl(`<${ORIGIN}/x?page=1>; rel="prev"`)).toBeNull();
    expect(nextPageUrl(null)).toBeNull();
  });
});

describe("headers", () => {
  it("sends a Bearer token, never PRIVATE-TOKEN", async () => {
    const fetchImpl = scripted([json({})]);
    await createRestClient({ origin: ORIGIN, fetchImpl, getToken: () => "tok" }).request("/x");
    const headers = fetchImpl.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["PRIVATE-TOKEN"]).toBeUndefined();
  });

  it("stays anonymous with no token getter", async () => {
    const fetchImpl = scripted([json({})]);
    await createRestClient({ origin: ORIGIN, fetchImpl }).request("/x");
    expect(
      (fetchImpl.mock.calls[0]![1].headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });

  it("resolves a relative path against the required instance origin", async () => {
    const fetchImpl = scripted([json({})]);
    await createRestClient({ origin: ORIGIN, fetchImpl }).request("/projects/1");
    expect(fetchImpl.mock.calls[0]![0]).toBe(`${ORIGIN}/projects/1`);
  });
});

describe("conditional requests", () => {
  it("stores an ETag and replays it as If-None-Match", async () => {
    const store = new Map<string, string>();
    const etagStore: EtagStore = {
      get: (k) => store.get(k) ?? null,
      set: (k, v) => void store.set(k, v),
    };
    const fetchImpl = scripted([json({ a: 1 }, { headers: { etag: 'W/"abc"' } }), json({ a: 1 })]);
    const client = createRestClient({ origin: ORIGIN, fetchImpl, etagStore });

    await client.request("/x");
    await client.request("/x");

    expect(
      (fetchImpl.mock.calls[0]![1].headers as Record<string, string>)["If-None-Match"],
    ).toBeUndefined();
    expect((fetchImpl.mock.calls[1]![1].headers as Record<string, string>)["If-None-Match"]).toBe(
      'W/"abc"',
    );
  });
});

describe("error mapping", () => {
  it("maps 404 to not-accessible", async () => {
    const err = await createRestClient({
      origin: ORIGIN,
      fetchImpl: scripted([json({}, { status: 404 })]),
    })
      .request("/x")
      .catch((e) => e);
    expect(err).toBeInstanceOf(GitLabNotAccessibleError);
    expect((err as GitLabNotAccessibleError).authWouldHelp).toBe(true);
  });

  it("maps 429 to a rate-limit error carrying the reset time", async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    const res = json(
      {},
      {
        status: 429,
        headers: { "ratelimit-remaining": "0", "ratelimit-reset": String(reset) },
      },
    );
    const err = await createRestClient({ origin: ORIGIN, fetchImpl: scripted([res]) })
      .request("/x")
      .catch((e) => e);
    expect(err).toBeInstanceOf(GitLabRateLimitError);
    expect((err as GitLabRateLimitError).resetAt?.getTime()).toBe(reset * 1000);
  });

  it("distinguishes a plain 403 from throttling", async () => {
    const err = await createRestClient({
      origin: ORIGIN,
      fetchImpl: scripted([json({}, { status: 403 })]),
    })
      .request("/x")
      .catch((e) => e);
    expect(err).toBeInstanceOf(GitLabNotAccessibleError);
    expect(err).not.toBeInstanceOf(GitLabRateLimitError);
  });

  it("retries once with a refreshed token on 401", async () => {
    const fetchImpl = scripted([json({}, { status: 401 }), json({ ok: true })]);
    const getToken = vi.fn(async (o?: { forceRefresh?: boolean }) =>
      o?.forceRefresh ? "fresh" : "stale",
    );
    await createRestClient({ origin: ORIGIN, fetchImpl, getToken }).request("/x");

    expect(getToken).toHaveBeenNthCalledWith(1, { forceRefresh: false });
    expect(getToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
    expect((fetchImpl.mock.calls[1]![1].headers as Record<string, string>).Authorization).toBe(
      "Bearer fresh",
    );
  });
});

describe("pagination", () => {
  it("follows Link rel=next and concatenates pages", async () => {
    const fetchImpl = scripted([
      json([{ n: 1 }], { headers: { link: `<${ORIGIN}/x?page=2>; rel="next"` } }),
      json([{ n: 2 }]),
    ]);
    expect(await createRestClient({ origin: ORIGIN, fetchImpl }).paginate("/x")).toEqual([
      { n: 1 },
      { n: 2 },
    ]);
  });

  it("falls back to X-Next-Page when Link is absent", async () => {
    const fetchImpl = scripted([
      json([{ n: 1 }], { headers: { "x-next-page": "2" } }),
      json([{ n: 2 }], { headers: { "x-next-page": "" } }),
    ]);
    const out = await createRestClient({ origin: ORIGIN, fetchImpl }).paginate("/x");
    expect(out).toEqual([{ n: 1 }, { n: 2 }]);
    expect(fetchImpl.mock.calls[1]![0]).toContain("page=2");
  });

  it("defaults per_page to 100 to minimise round trips", async () => {
    const fetchImpl = scripted([json([])]);
    await createRestClient({ origin: ORIGIN, fetchImpl }).paginate("/x");
    expect(fetchImpl.mock.calls[0]![0]).toContain("per_page=100");
  });

  it("stops at the page cap instead of looping forever on a cyclic Link", async () => {
    const cyclic = () =>
      json([{ n: 1 }], { headers: { link: `<${ORIGIN}/x?page=2>; rel="next"` } });
    const fetchImpl = scripted([cyclic()]);
    const out = await createRestClient({ origin: ORIGIN, fetchImpl }).paginate("/x", { max: 3 });
    expect(out).toHaveLength(3);
  });
});

describe("rateLimit()", () => {
  it("reports the last response's quota headers", async () => {
    const res = json(
      {},
      {
        headers: {
          "ratelimit-limit": "2000",
          "ratelimit-remaining": "1998",
          "ratelimit-observed": "2",
        },
      },
    );
    const client = createRestClient({ origin: ORIGIN, fetchImpl: scripted([res]) });
    await client.request("/x");
    expect(client.rateLimit()).toMatchObject({ limit: 2000, remaining: 1998, offQuota: false });
  });

  it("flags a response that reports no quota at all", async () => {
    const client = createRestClient({ origin: ORIGIN, fetchImpl: scripted([json({})]) });
    await client.request("/x");
    expect(client.rateLimit().offQuota).toBe(true);
  });
});
