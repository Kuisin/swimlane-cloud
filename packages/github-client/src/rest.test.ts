import { describe, expect, it, vi } from "vitest";
import { createRestClient, nextPageUrl } from "./rest.ts";
import { GitHubNotAccessibleError, GitHubRateLimitError, GitHubSsoError } from "./errors.ts";
import type { EtagStore, FetchImpl } from "./types.ts";

type Call = [string, RequestInit];

/**
 * Replays a script of responses, cloning each one: a Response body may only be
 * read once, so a repeated entry has to hand out a fresh instance every call.
 */
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
    const link =
      '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=9>; rel="last"';
    expect(nextPageUrl(link)).toBe("https://api.github.com/x?page=2");
  });

  it("returns null on the last page", () => {
    expect(nextPageUrl('<https://api.github.com/x?page=1>; rel="prev"')).toBeNull();
    expect(nextPageUrl(null)).toBeNull();
  });
});

describe("headers", () => {
  it("pins the API version so a future default cannot reshape responses", async () => {
    const fetchImpl = scripted([json({})]);
    await createRestClient({ fetchImpl }).request("/x");
    const headers = fetchImpl.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(headers.Accept).toBe("application/vnd.github+json");
  });

  it("stays anonymous with no token getter", async () => {
    const fetchImpl = scripted([json({})]);
    await createRestClient({ fetchImpl }).request("/x");
    expect(
      (fetchImpl.mock.calls[0]![1].headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });
});

describe("redirects", () => {
  it("follows GET redirects — /repos/{o}/{r} 301s to /repositories/{id}", async () => {
    const fetchImpl = scripted([json({ ok: true })]);
    await createRestClient({ fetchImpl }).request("/repos/o/r");
    expect(fetchImpl.mock.calls[0]![1].redirect).toBe("follow");
  });

  it("re-issues a redirected POST with the SAME method", async () => {
    // Per the fetch spec a 301 on POST is rewritten to GET, which would turn
    // "create ref" into a read that silently succeeds and changes nothing.
    const fetchImpl = scripted([
      new Response(null, {
        status: 301,
        headers: { location: "https://api.github.com/repositories/1/git/refs" },
      }),
      json({ ref: "refs/heads/x" }),
    ]);
    await createRestClient({ fetchImpl }).request("/repos/o/r/git/refs", {
      method: "POST",
      body: { a: 1 },
    });

    expect(fetchImpl.mock.calls[0]![1].redirect).toBe("manual");
    expect(fetchImpl.mock.calls[1]![0]).toBe("https://api.github.com/repositories/1/git/refs");
    expect(fetchImpl.mock.calls[1]![1].method).toBe("POST");
    expect(fetchImpl.mock.calls[1]![1].body).toBe(JSON.stringify({ a: 1 }));
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
    const client = createRestClient({ fetchImpl, etagStore });

    await client.request("/x");
    await client.request("/x");

    expect(
      (fetchImpl.mock.calls[0]![1].headers as Record<string, string>)["If-None-Match"],
    ).toBeUndefined();
    // A 304 costs no quota, which is the whole point of doing this.
    expect((fetchImpl.mock.calls[1]![1].headers as Record<string, string>)["If-None-Match"]).toBe(
      'W/"abc"',
    );
  });

  it("never sends If-None-Match on a write", async () => {
    const etagStore: EtagStore = { get: () => 'W/"abc"', set: () => {} };
    const fetchImpl = scripted([json({})]);
    await createRestClient({ fetchImpl, etagStore }).request("/x", { method: "POST", body: {} });
    expect(
      (fetchImpl.mock.calls[0]![1].headers as Record<string, string>)["If-None-Match"],
    ).toBeUndefined();
  });
});

describe("error mapping", () => {
  it("maps 404 to not-accessible — GitHub hides private repos behind it", async () => {
    const err = await createRestClient({ fetchImpl: scripted([json({}, { status: 404 })]) })
      .request("/x")
      .catch((e) => e);
    expect(err).toBeInstanceOf(GitHubNotAccessibleError);
    expect((err as GitHubNotAccessibleError).authWouldHelp).toBe(true);
  });

  it("maps an exhausted budget to a rate-limit error carrying the reset time", async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    const res = json(
      {},
      {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
      },
    );
    const err = await createRestClient({ fetchImpl: scripted([res]) })
      .request("/x")
      .catch((e) => e);
    expect(err).toBeInstanceOf(GitHubRateLimitError);
    expect((err as GitHubRateLimitError).resetAt?.getTime()).toBe(reset * 1000);
  });

  it("distinguishes a plain 403 from throttling", async () => {
    const err = await createRestClient({ fetchImpl: scripted([json({}, { status: 403 })]) })
      .request("/x")
      .catch((e) => e);
    expect(err).toBeInstanceOf(GitHubNotAccessibleError);
    expect(err).not.toBeInstanceOf(GitHubRateLimitError);
  });

  it("surfaces SAML SSO with the org and authorize URL", async () => {
    // A bare 403 here is unexplainable to a user; the header is the only clue.
    const res = json(
      {},
      {
        status: 403,
        headers: {
          "x-github-sso":
            "required; organizations=acme,globex; url=https://github.com/orgs/acme/sso",
        },
      },
    );
    const err = await createRestClient({ fetchImpl: scripted([res]) })
      .request("/x")
      .catch((e) => e);
    expect(err).toBeInstanceOf(GitHubSsoError);
    expect((err as GitHubSsoError).organizations).toEqual(["acme", "globex"]);
    expect((err as GitHubSsoError).authorizeUrl).toBe("https://github.com/orgs/acme/sso");
  });

  it("retries once with a refreshed token on 401", async () => {
    const fetchImpl = scripted([json({}, { status: 401 }), json({ ok: true })]);
    const getToken = vi.fn(async (o?: { forceRefresh?: boolean }) =>
      o?.forceRefresh ? "fresh" : "stale",
    );
    await createRestClient({ fetchImpl, getToken }).request("/x");

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
      json([{ n: 1 }], { headers: { link: '<https://api.github.com/x?page=2>; rel="next"' } }),
      json([{ n: 2 }]),
    ]);
    expect(await createRestClient({ fetchImpl }).paginate("/x")).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("defaults per_page to 100 to minimise round trips", async () => {
    const fetchImpl = scripted([json([])]);
    await createRestClient({ fetchImpl }).paginate("/x");
    expect(fetchImpl.mock.calls[0]![0]).toContain("per_page=100");
  });

  it("stops at the page cap instead of looping forever on a cyclic Link", async () => {
    const cyclic = () =>
      json([{ n: 1 }], { headers: { link: '<https://api.github.com/x?page=2>; rel="next"' } });
    const fetchImpl = scripted([cyclic()]);
    const out = await createRestClient({ fetchImpl }).paginate("/x", { max: 3 });
    expect(out).toHaveLength(3);
  });
});

describe("rateLimit()", () => {
  it("reports the last response's quota headers", async () => {
    const res = json(
      {},
      {
        headers: {
          "x-ratelimit-limit": "5000",
          "x-ratelimit-remaining": "4998",
          "x-ratelimit-used": "2",
        },
      },
    );
    const client = createRestClient({ fetchImpl: scripted([res]) });
    await client.request("/x");
    expect(client.rateLimit()).toMatchObject({
      limit: 5000,
      remaining: 4998,
      used: 2,
      offQuota: false,
    });
  });

  it("flags a response that reports no quota at all", async () => {
    const client = createRestClient({ fetchImpl: scripted([json({})]) });
    await client.request("/x");
    expect(client.rateLimit().offQuota).toBe(true);
  });
});
