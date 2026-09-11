/**
 * REST transport for one org's GitLab instance (self-hosted or gitlab.com).
 *
 * Unlike `@swimlane-cloud/github-client/rest`, there is no well-known default
 * origin — every instance is a different host an org registered, so `origin`
 * is required on every client. Auth is always an OAuth access token (the
 * per-instance OAuth Application flow in `apps/saas/src/lib/gitlab.ts`);
 * GitLab's `PRIVATE-TOKEN` header for personal access tokens is intentionally
 * not supported here (see the auth decision in the plan).
 */

import {
  GitLabConflictError,
  GitLabError,
  GitLabNotAccessibleError,
  GitLabProtocolError,
  GitLabRateLimitError,
} from "./errors.ts";
import type { EtagStore, FetchImpl, RateLimitSnapshot, TokenGetter } from "./types.ts";

export interface RestClientOptions {
  /** `https://gitlab.example.com/api/v4` (or `https://gitlab.com/api/v4`) — required, no default. */
  origin: string;
  fetchImpl?: FetchImpl;
  getToken?: TokenGetter;
  etagStore?: EtagStore;
  userAgent?: string;
}

export interface RestRequestOptions {
  method?: string;
  body?: unknown;
  accept?: string;
  /** Passed through to `fetchImpl` so each app can apply its own cache policy. */
  immutable?: boolean;
  signal?: AbortSignal;
  /** Opt out of conditional requests for a call whose body we always need. */
  noEtag?: boolean;
}

export interface RestClient {
  request<T>(path: string, options?: RestRequestOptions): Promise<T>;
  /** Follows `Link: rel="next"`, falling back to `X-Next-Page` when absent. */
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
  const reset = num("ratelimit-reset");
  return {
    limit: num("ratelimit-limit"),
    remaining: num("ratelimit-remaining"),
    used: num("ratelimit-observed"),
    resetAt: reset === null ? null : new Date(reset * 1000),
    offQuota: res.headers.get("ratelimit-limit") === null,
  };
}

/** `<https://.../api/v4/x?page=2>; rel="next", <...>; rel="last"` */
export function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part.trim());
    if (m) return m[1]!;
  }
  return null;
}

/**
 * `Link` is GitLab's primary pagination signal and shaped just like GitHub's,
 * but some instances configure keyset pagination or omit it; `X-Next-Page`
 * (a bare page number, or empty when there is no next page) is the fallback.
 */
function nextPage(res: Response, currentUrl: string): string | null {
  const fromLink = nextPageUrl(res.headers.get("link"));
  if (fromLink) return fromLink;
  const next = res.headers.get("x-next-page");
  if (!next) return null;
  const url = new URL(currentUrl);
  url.searchParams.set("page", next);
  return url.toString();
}

export function createRestClient(options: RestClientOptions): RestClient {
  const {
    origin,
    fetchImpl = fetch as FetchImpl,
    getToken,
    etagStore,
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
      Accept: opts.accept ?? "application/json",
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
      if (known) headers["If-None-Match"] = known;
    }

    const init: RequestInit = { method, headers, redirect: "follow" };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    if (opts.signal) init.signal = opts.signal;
    if (opts.immutable !== undefined) {
      (init as RequestInit & { immutable?: boolean }).immutable = opts.immutable;
    }

    const res = await fetchImpl(url, init);

    if (useEtag) {
      const etag = res.headers.get("etag");
      if (etag && res.ok) await etagStore.set(url, etag);
    }
    return res;
  }

  async function raise(res: Response, url: string): Promise<never> {
    if (res.status === 401) {
      throw new GitLabNotAccessibleError("GitLab rejected the credentials (HTTP 401).", {
        status: 401,
        url,
        authWouldHelp: true,
      });
    }
    if (res.status === 429) {
      const remaining = res.headers.get("ratelimit-remaining");
      const retryAfter = res.headers.get("retry-after");
      const reset = Number(res.headers.get("ratelimit-reset"));
      throw new GitLabRateLimitError("GitLab rate limit exceeded.", {
        status: 429,
        url,
        remaining: remaining === null ? null : Number(remaining),
        resetAt: Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : null,
        retryAfterSeconds: retryAfter ? Number(retryAfter) || null : null,
      });
    }
    if (res.status === 403) {
      throw new GitLabNotAccessibleError("GitLab refused the request (HTTP 403).", {
        status: 403,
        url,
      });
    }
    if (res.status === 404) {
      // GitLab returns 404 rather than 403 for private resources on purpose,
      // so this is indistinguishable from "does not exist" — say so plainly.
      throw new GitLabNotAccessibleError("Not found, or not visible to these credentials.", {
        status: 404,
        url,
        authWouldHelp: true,
      });
    }
    if (res.status === 409 || res.status === 422 || res.status === 400) {
      let detail = "";
      try {
        const body = (await res.json()) as { message?: string | string[]; error?: string };
        detail = Array.isArray(body.message)
          ? body.message.join(", ")
          : (body.message ?? body.error ?? "");
      } catch {
        /* body already consumed or not JSON */
      }
      throw new GitLabConflictError(detail || `GitLab rejected the change (HTTP ${res.status}).`, {
        status: res.status,
        url,
      });
    }
    throw new GitLabError(`GitLab request failed with HTTP ${res.status}.`, {
      status: res.status,
      url,
    });
  }

  async function once(url: string, opts: RestRequestOptions): Promise<Response> {
    let res = await send(url, opts, false);
    // An expired OAuth token surfaces as 401; one retry with a refreshed
    // token (the caller's getToken closure handles the actual refresh) turns
    // a hard failure into a hiccup.
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
        throw new GitLabProtocolError(
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
        url = nextPage(res, url);
        pages += 1;
      }
      return out;
    },

    rateLimit(): RateLimitSnapshot {
      return lastRateLimit;
    },
  };
}
