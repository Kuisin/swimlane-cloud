/**
 * The caching adapter — the only place in the hub that knows about Next.
 *
 * `@swimlane-cloud/github-client` deliberately takes no cache policy of its
 * own; it accepts a `fetchImpl` and the app decides. That is what keeps the
 * same package usable from a VS Code extension host, where every one of these
 * options would be meaningless.
 */

import { cache } from "react";
import { cookies } from "next/headers";
import {
  createRepoReader,
  type FetchImpl,
  type RepoReaderApi,
} from "@swimlane-cloud/github-client";
import { openSession, SESSION_COOKIE } from "@/lib/session";

/** A 40-char commit sha addresses content that cannot change, ever. */
const SHA_RE = /^[0-9a-f]{40}$/;

/**
 * Content behind a sha is immutable by construction, so it may be cached
 * forever. Note we assert that ourselves rather than inheriting it: measured,
 * `raw.githubusercontent.com` answers `cache-control: max-age=300` with no
 * `immutable` even at a full sha. The CDN will not promise what the content
 * model guarantees, which makes Next's data cache load-bearing here.
 */
function isImmutableUrl(url: string): boolean {
  return new URL(url).pathname.split("/").some((s) => SHA_RE.test(s));
}

/** Anonymous: public content only, so it is safe in a shared cache. */
const publicFetch: FetchImpl = (url, init) => {
  const immutable =
    (init as (RequestInit & { immutable?: boolean }) | undefined)?.immutable ?? isImmutableUrl(url);
  const clean: RequestInit = { ...init };
  delete (clean as { immutable?: boolean }).immutable;

  return immutable
    ? fetch(url, { ...clean, cache: "force-cache" })
    : // Mutable refs. The route's long stale-while-revalidate is the real
      // rate-limit defence; this only bounds how stale a resolved ref can get.
      fetch(url, { ...clean, next: { revalidate: 60 } });
};

/**
 * Signed in: every response is scoped to one user's permissions. Caching any
 * of it in Next's shared data cache would serve one user's private repository
 * to the next visitor, so authenticated reads are never cached at all. The
 * 5,000/hr per-token budget is ample without it.
 */
const privateFetch: FetchImpl = (url, init) => {
  const clean: RequestInit = { ...init };
  delete (clean as { immutable?: boolean }).immutable;
  return fetch(url, { ...clean, cache: "no-store" });
};

export async function getSession() {
  const jar = await cookies();
  return openSession(jar.get(SESSION_COOKIE)?.value);
}

/**
 * `cache()` dedups within a single request — a page that resolves a ref and
 * then reads two files shares one reader, and therefore one `ls-refs` round
 * trip, instead of three.
 */
/**
 * Endpoint overrides. Unset in production; set to point at GitHub Enterprise
 * Server, or at a local git server for an end-to-end test.
 */
function origins() {
  const git = process.env.GITHUB_GIT_ORIGIN;
  const raw = process.env.GITHUB_RAW_ORIGIN;
  const api = process.env.GITHUB_API_ORIGIN;
  if (!git && !raw && !api) return undefined;
  return { ...(git ? { git } : {}), ...(raw ? { raw } : {}), ...(api ? { api } : {}) };
}

export const getReader = cache(async (owner: string, repo: string): Promise<RepoReaderApi> => {
  const session = await getSession();
  const shared = { ...(origins() ? { origins: origins() } : {}) };
  return session
    ? createRepoReader(
        { owner, repo },
        { ...shared, fetchImpl: privateFetch, getToken: () => session.token },
      )
    : createRepoReader({ owner, repo }, { ...shared, fetchImpl: publicFetch });
});
