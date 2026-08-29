/**
 * REST transport for `api.github.com` — the authenticated read path, and the
 * only path for writes.
 *
 * Quota shape, which drives every decision here: 60/hr per source IP
 * anonymously (shared across every visitor of a server), 5,000/hr per user
 * token. Anonymous callers should be on `refs.ts` + `raw.ts` instead; this
 * module assumes a token in the normal case.
 */

import {
  GitHubConflictError,
  GitHubError,
  GitHubNotAccessibleError,
  GitHubProtocolError,
  GitHubRateLimitError,
  GitHubSsoError,
} from "./errors.ts";
import type { EtagStore, FetchImpl, RateLimitSnapshot, TokenGetter } from "./types.ts";

const API_ORIGIN = "https://api.github.com";
/** Pinning the version keeps a future breaking change from silently reshaping responses. */
const API_VERSION = "2022-11-28";

export interface RestClientOptions {
  fetchImpl?: FetchImpl;
  getToken?: TokenGetter;
  etagStore?: EtagStore;
  origin?: string;
  userAgent?: string;
}

export interface RestRequestOptions {
  method?: string;
  body?: unknown;
  /** Sent as-is; use for `application/vnd.github.raw` on the Contents API. */
  accept?: string;
  /**
   * Marks a sha-addressed response. Passed through to `fetchImpl` so each app
   * can apply its own cache policy without this package knowing about Next.
   */
  immutable?: boolean;
  signal?: AbortSignal;
  /** Opt out of conditional requests for a call whose body we always need. */
  noEtag?: boolean;
}

export interface RestClient {
  request<T>(path: string, options?: RestRequestOptions): Promise<T>;
  /** Follows `Link: rel="next"` and concatenates the pages. */
  paginate<T>(
    path: string,
    options?: RestRequestOptions & { perPage?: number; max?: number },
  ): Promise<T[]>;
  requestText(path: string, options?: RestRequestOptions): Promise<string>;
  rateLimit(): RateLimitSnapshot;
}

function parseRateLimit(res: Response): RateLimitSnapshot {
  const num = (h: string): number | null => {
    const v = res.headers.get(h);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const reset = num("x-ratelimit-reset");
  return {
    limit: num("x-ratelimit-limit"),
    remaining: num("x-ratelimit-remaining"),
    used: num("x-ratelimit-used"),
    resetAt: reset === null ? null : new Date(reset * 1000),
    offQuota: res.headers.get("x-ratelimit-limit") === null,
  };
}

/** `<https://api.github.com/...?page=2>; rel="next", <...>; rel="last"` */
export function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part.trim());
    if (m) return m[1]!;
  }
  return null;
}

function ssoErrorFrom(res: Response, url: string): GitHubSsoError | null {
  const header = res.headers.get("x-github-sso");
  if (!header) return null;
  const orgs = /organizations=([^;\s]+)/.exec(header)?.[1]?.split(",").filter(Boolean) ?? [];
  const authorize = /url=([^;,\s]+)/.exec(header)?.[1] ?? null;
  return new GitHubSsoError(
    orgs.length
      ? `This token is not authorised for SAML SSO organisation(s): ${orgs.join(", ")}.`
      : "This token is not authorised for the organisation's SAML SSO.",
    { status: res.status, url, organizations: orgs, authorizeUrl: authorize },
  );
}

export function createRestClient(options: RestClientOptions = {}): RestClient {
  const {
    fetchImpl = fetch as FetchImpl,
    getToken,
    etagStore,
    origin = API_ORIGIN,
    userAgent = "swimlane-cloud",
  } = options;

  let lastRateLimit: RateLimitSnapshot = {
    limit: null,
    remaining: null,
    used: null,
    resetAt: null,
    offQuota: false,
  };

  async function headersFor(
    opts: RestRequestOptions,
    forceRefresh: boolean,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Accept: opts.accept ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": userAgent,
    };
    const token = getToken ? await getToken({ forceRefresh }) : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    return headers;
  }

  async function send(
    url: string,
    opts: RestRequestOptions,
    forceRefresh: boolean,
  ): Promise<Response> {
    const method = opts.method ?? "GET";
    const headers = await headersFor(opts, forceRefresh);

    const useEtag = !opts.noEtag && method === "GET" && etagStore;
    if (useEtag) {
      const known = await etagStore.get(url);
      // A 304 costs no quota at all — the largest single lever on the 5,000/hr
      // authenticated budget.
      if (known) headers["If-None-Match"] = known;
    }

    const init: RequestInit = {
      method,
      headers,
      // `api.github.com/repos/{o}/{r}/...` 301-redirects to the numeric
      // `/repositories/{id}/...` form. Per the fetch spec a 301 on POST is
      // rewritten to GET, which would silently turn "create ref" into a read.
      // Follow redirects only for GET; handle them explicitly otherwise.
      redirect: method === "GET" ? "follow" : "manual",
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    if (opts.signal) init.signal = opts.signal;
    if (opts.immutable !== undefined) {
      (init as RequestInit & { immutable?: boolean }).immutable = opts.immutable;
    }

    let res = await fetchImpl(url, init);

    // Re-issue a redirected write against the resolved location, same method.
    if (method !== "GET" && res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new GitHubProtocolError(`HTTP ${res.status} with no Location header`, {
          status: res.status,
          url,
        });
      }
      res = await fetchImpl(new URL(location, url).toString(), init);
    }

    if (useEtag) {
      const etag = res.headers.get("etag");
      if (etag && res.ok) await etagStore.set(url, etag);
    }
    return res;
  }

  async function raise(res: Response, url: string): Promise<never> {
    const sso = ssoErrorFrom(res, url);
    if (sso) throw sso;

    if (res.status === 401) {
      throw new GitHubNotAccessibleError("GitHub rejected the credentials (HTTP 401).", {
        status: 401,
        url,
        authWouldHelp: true,
      });
    }
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const retryAfter = res.headers.get("retry-after");
      if (remaining === "0" || retryAfter || res.status === 429) {
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        throw new GitHubRateLimitError("GitHub rate limit exceeded.", {
          status: res.status,
          url,
          remaining: remaining === null ? null : Number(remaining),
          resetAt: Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : null,
          retryAfterSeconds: retryAfter ? Number(retryAfter) || null : null,
        });
      }
      throw new GitHubNotAccessibleError("GitHub refused the request (HTTP 403).", {
        status: 403,
        url,
      });
    }
    if (res.status === 404) {
      // GitHub returns 404 rather than 403 for private resources on purpose,
      // so this is indistinguishable from "does not exist" — say so plainly.
      throw new GitHubNotAccessibleError("Not found, or not visible to these credentials.", {
        status: 404,
        url,
        authWouldHelp: true,
      });
    }
    if (res.status === 409 || res.status === 422) {
      let detail = "";
      try {
        detail = ((await res.json()) as { message?: string }).message ?? "";
      } catch {
        /* body already consumed or not JSON */
      }
      throw new GitHubConflictError(detail || `GitHub rejected the change (HTTP ${res.status}).`, {
        status: res.status,
        url,
      });
    }
    throw new GitHubError(`GitHub request failed with HTTP ${res.status}.`, {
      status: res.status,
      url,
    });
  }

  async function once(url: string, opts: RestRequestOptions): Promise<Response> {
    let res = await send(url, opts, false);
    // A VS Code auth session can expire mid-flight; one retry with a fresh
    // token turns a hard failure into a hiccup.
    if (res.status === 401 && getToken) res = await send(url, opts, true);
    lastRateLimit = parseRateLimit(res);
    return res;
  }

  function absolute(path: string): string {
    return path.startsWith("http") ? path : `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
  }

  return {
    async request<T>(path: string, opts: RestRequestOptions = {}): Promise<T> {
      const url = absolute(path);
      const res = await once(url, opts);
      if (res.status === 304) {
        throw new GitHubProtocolError(
          "Received 304 but no cached body is available; pass noEtag for this call.",
          { status: 304, url },
        );
      }
      if (!res.ok) await raise(res, url);
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },

    async requestText(path: string, opts: RestRequestOptions = {}): Promise<string> {
      const url = absolute(path);
      const res = await once(url, opts);
      if (!res.ok) await raise(res, url);
      return await res.text();
    },

    async paginate<T>(
      path: string,
      opts: RestRequestOptions & { perPage?: number; max?: number } = {},
    ): Promise<T[]> {
      const { perPage = 100, max = 10, ...rest } = opts;
      const first = new URL(absolute(path));
      if (!first.searchParams.has("per_page")) first.searchParams.set("per_page", String(perPage));

      const out: T[] = [];
      let url: string | null = first.toString();
      let pages = 0;

      while (url && pages < max) {
        const res: Response = await once(url, { ...rest, noEtag: true });
        if (!res.ok) await raise(res, url);
        const page = (await res.json()) as T[];
        out.push(...(Array.isArray(page) ? page : []));
        url = nextPageUrl(res.headers.get("link"));
        pages += 1;
      }
      return out;
    },

    rateLimit(): RateLimitSnapshot {
      return lastRateLimit;
    },
  };
}
