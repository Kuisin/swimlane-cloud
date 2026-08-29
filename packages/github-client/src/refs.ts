/**
 * Ref discovery over git's smart-HTTP protocol v2 — the anonymous read path.
 *
 * Why this exists at all: unauthenticated `api.github.com` allows 60 requests
 * per hour **per source IP**, and on a server that IP is shared by every
 * anonymous visitor of every repo. One `revalidate: 60` on a single ref would
 * consume the entire global budget. Measured against `facebook/react`, the git
 * endpoints move neither `x-ratelimit-remaining` nor `x-ratelimit-used`, so
 * this path is free.
 *
 * Why v2 rather than the v1 `info/refs` advertisement: v1 is unfiltered. For
 * `facebook/react` it is 1.6 MB / 24,615 records (964 branches, 269 tags),
 * downloaded in full to learn one sha. A v2 `ls-refs` with `ref-prefix`
 * filters returns the same information in ~1-3 KB, and `symrefs` + `peel` hand
 * back the default branch and the peeled commit shas of annotated tags for
 * free — both of which v1 makes you work for.
 */

import { GitHubNotAccessibleError, GitHubProtocolError, GitHubRateLimitError } from "./errors.ts";
import { concatPkt, DELIM_PKT, encodePktLine, FLUSH_PKT, pktTextLines } from "./pkt-line.ts";
import type { FetchImpl, RefEntry, RepoRef } from "./types.ts";

const GITHUB_ORIGIN = "https://github.com";
const AGENT = "swimlane-cloud";

export interface LsRefsOptions {
  fetchImpl?: FetchImpl;
  /** Bearer token. Anonymous when omitted; required for private repos. */
  token?: string | null;
  origin?: string;
  /**
   * Server-side ref filters. Prefixes are matched literally, so
   * `refs/heads/main` matches `refs/heads/main` AND `refs/heads/main-2` —
   * filter exact names on the result if that matters.
   */
  refPrefixes?: string[];
  signal?: AbortSignal;
}

export interface LsRefsResult {
  refs: RefEntry[];
  /** Short name of the branch `HEAD` points at, from `symref-target`. */
  defaultBranch: string | null;
  headSha: string | null;
}

function uploadPackUrl(repo: RepoRef, origin: string): string {
  return `${origin}/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}.git/git-upload-pack`;
}

function buildLsRefsRequest(refPrefixes: string[]): Uint8Array {
  const parts: Array<Uint8Array | string> = [
    encodePktLine("command=ls-refs\n"),
    encodePktLine("object-format=sha1\n"),
    encodePktLine(`agent=${AGENT}\n`),
    DELIM_PKT,
    // `peel` resolves annotated tag objects to the commit they point at.
    // Without it a `/t/{tag}` URL would canonicalise to a tag-object sha,
    // which is not a commit and cannot be read as a tree.
    encodePktLine("peel\n"),
    // `symrefs` reports `HEAD symref-target:refs/heads/<x>`, which is how we
    // learn the default branch without spending a REST call on `getRepo`.
    encodePktLine("symrefs\n"),
  ];
  for (const prefix of refPrefixes) {
    parts.push(encodePktLine(`ref-prefix ${prefix}\n`));
  }
  parts.push(FLUSH_PKT);
  return concatPkt(parts);
}

const REF_LINE = /^([0-9a-f]{40}) (\S+)(.*)$/;

/** Parse one `<sha> <ref>[ symref-target:<r>][ peeled:<sha>]` advertisement line. */
export function parseRefLine(line: string): (RefEntry & { symrefTarget?: string }) | null {
  const m = REF_LINE.exec(line);
  if (!m) return null;
  const [, sha, ref, rest] = m as unknown as [string, string, string, string];

  const entry: RefEntry & { symrefTarget?: string } = {
    ref,
    name: ref.replace(/^refs\/(heads|tags)\//, ""),
    sha,
  };
  const peeled = /\bpeeled:([0-9a-f]{40})\b/.exec(rest);
  if (peeled) entry.peeled = peeled[1]!;
  const symref = /\bsymref-target:(\S+)/.exec(rest);
  if (symref) entry.symrefTarget = symref[1]!;
  return entry;
}

/** Parse a complete `ls-refs` response body. Exported so tests can run offline. */
export function parseLsRefs(body: Uint8Array): LsRefsResult {
  const refs: RefEntry[] = [];
  let defaultBranch: string | null = null;
  let headSha: string | null = null;

  for (const line of pktTextLines(body)) {
    const entry = parseRefLine(line);
    if (!entry) continue;

    if (entry.ref === "HEAD") {
      headSha = entry.sha;
      if (entry.symrefTarget) {
        defaultBranch = entry.symrefTarget.replace(/^refs\/heads\//, "");
      }
      continue;
    }
    const { symrefTarget: _drop, ...rest } = entry;
    refs.push(rest);
  }

  return { refs, defaultBranch, headSha };
}

/**
 * Run one `ls-refs` round trip.
 *
 * A private or non-existent repo answers `401` with
 * `www-authenticate: Basic realm="GitHub"` here, not the `404` the REST API
 * returns — so the caller gets a usable "sign in and this may work" signal.
 */
export async function lsRefs(repo: RepoRef, options: LsRefsOptions = {}): Promise<LsRefsResult> {
  const {
    fetchImpl = fetch as FetchImpl,
    token = null,
    origin = GITHUB_ORIGIN,
    refPrefixes = ["HEAD", "refs/heads/", "refs/tags/"],
    signal,
  } = options;

  const url = uploadPackUrl(repo, origin);
  const headers: Record<string, string> = {
    // Selects protocol v2. Without it the server answers in v1 and ignores
    // every ref-prefix, which is the 1.6 MB case this module exists to avoid.
    "Git-Protocol": "version=2",
    "Content-Type": "application/x-git-upload-pack-request",
    Accept: "application/x-git-upload-pack-result",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = {
    method: "POST",
    headers,
    body: buildLsRefsRequest(refPrefixes) as unknown as BodyInit,
  };
  if (signal) init.signal = signal;

  const res = await fetchImpl(url, init);

  if (res.status === 401 || res.status === 403 || res.status === 404) {
    const retryAfter = res.headers.get("retry-after");
    if (res.status === 403 && retryAfter) {
      throw new GitHubRateLimitError("GitHub is throttling git protocol requests", {
        status: res.status,
        url,
        retryAfterSeconds: Number(retryAfter) || null,
      });
    }
    throw new GitHubNotAccessibleError(
      `Cannot read ${repo.owner}/${repo.repo} (HTTP ${res.status}). It may be private or may not exist.`,
      { status: res.status, url, authWouldHelp: res.status === 401 && !token },
    );
  }
  if (res.status === 429) {
    throw new GitHubRateLimitError("GitHub is throttling git protocol requests", {
      status: 429,
      url,
      retryAfterSeconds: Number(res.headers.get("retry-after")) || null,
    });
  }
  if (!res.ok) {
    throw new GitHubProtocolError(`ls-refs failed with HTTP ${res.status}`, {
      status: res.status,
      url,
    });
  }

  const body = new Uint8Array(await res.arrayBuffer());
  const parsed = parseLsRefs(body);
  if (parsed.refs.length === 0 && parsed.headSha === null) {
    // An empty repo legitimately advertises nothing; a mangled response does
    // too. Only the latter is worth failing on, and we cannot tell them apart,
    // so return the empty result and let the caller decide.
    return parsed;
  }
  return parsed;
}
