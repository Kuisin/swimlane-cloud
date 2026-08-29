/**
 * Blob reads over `raw.githubusercontent.com` — the anonymous read path.
 *
 * Measured: this host consumes no REST quota, so a public diagram view can cost
 * zero of the 60/hr anonymous budget.
 *
 * It does NOT, however, serve immutable cache headers. Even at a full 40-char
 * commit sha the response is `cache-control: max-age=300` with a strong ETag
 * and no `immutable`. The content genuinely cannot change — a sha-addressed
 * blob is fixed — but we cannot lean on the CDN to hold it. Callers that want
 * long-term caching must do it themselves, which is why `apps/hub` marks
 * sha-addressed fetches `force-cache` in its own `fetchImpl`.
 *
 * Private repos are not reachable here at all: this host takes no credentials.
 * Authenticated reads go through `rest.ts` instead.
 */

import { GitHubNotAccessibleError, GitHubProtocolError, GitHubRateLimitError } from "./errors.ts";
import type { FetchImpl, FileBlob, RepoRef } from "./types.ts";

const RAW_ORIGIN = "https://raw.githubusercontent.com";

export interface RawOptions {
  fetchImpl?: FetchImpl;
  origin?: string;
  signal?: AbortSignal;
  /** Refuse anything larger, so one huge file cannot exhaust server memory. */
  maxBytes?: number;
}

export function rawUrl(repo: RepoRef, at: string, path: string, origin = RAW_ORIGIN): string {
  const clean = path.replace(/^\/+/, "");
  const encoded = clean.split("/").map(encodeURIComponent).join("/");
  return `${origin}/${repo.owner}/${repo.repo}/${at}/${encoded}`;
}

/**
 * Read one file. Returns null when the path does not exist at that ref, which
 * is an ordinary outcome (a diagram added after the tag being viewed), not an
 * error.
 */
export async function rawFile(
  repo: RepoRef,
  at: string,
  path: string,
  options: RawOptions = {},
): Promise<FileBlob | null> {
  const {
    fetchImpl = fetch as FetchImpl,
    origin = RAW_ORIGIN,
    signal,
    maxBytes = 2_000_000,
  } = options;

  const url = rawUrl(repo, at, path, origin);
  const init: RequestInit = { method: "GET" };
  if (signal) init.signal = signal;

  const res = await fetchImpl(url, init);

  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) {
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) {
      throw new GitHubRateLimitError("raw.githubusercontent.com is throttling requests", {
        status: res.status,
        url,
        retryAfterSeconds: Number(retryAfter) || null,
      });
    }
    throw new GitHubNotAccessibleError(
      `Cannot read ${path} from ${repo.owner}/${repo.repo}. Private repositories are not readable anonymously.`,
      { status: res.status, url, authWouldHelp: true },
    );
  }
  if (res.status === 429) {
    throw new GitHubRateLimitError("raw.githubusercontent.com is throttling requests", {
      status: 429,
      url,
      retryAfterSeconds: Number(res.headers.get("retry-after")) || null,
    });
  }
  if (!res.ok) {
    throw new GitHubProtocolError(`raw read failed with HTTP ${res.status}`, {
      status: res.status,
      url,
    });
  }

  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new GitHubProtocolError(`File is ${declared} bytes, over the ${maxBytes}-byte limit`, {
      url,
    });
  }

  const text = await res.text();
  if (text.length > maxBytes) {
    throw new GitHubProtocolError(`File exceeds the ${maxBytes}-byte limit`, { url });
  }

  return { text, at, path: path.replace(/^\/+/, "") };
}
