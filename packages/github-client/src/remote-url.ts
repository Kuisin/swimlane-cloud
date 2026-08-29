/**
 * Parse a GitHub remote into `{ owner, repo }`.
 *
 * Needed in both new apps for different reasons: the VS Code extension reads
 * whatever `git remote get-url origin` prints, and the hub parses a URL the
 * user pastes. Both see the same handful of forms.
 *
 * A caveat that matters for the extension: `url.<base>.insteadOf` rewrites mean
 * `git config remote.origin.url` is not necessarily the effective URL. Resolve
 * with `git ls-remote --get-url origin` and parse that instead.
 */

import type { RepoRef } from "./types.ts";

const HOSTS = new Set(["github.com", "www.github.com"]);

function clean(owner: string, repo: string, host: string): RepoRef & { host: string } {
  return { owner, repo: repo.replace(/\.git$/, ""), host };
}

/**
 * Returns null rather than throwing: callers routinely probe a remote that may
 * legitimately point somewhere other than GitHub (GitLab, a corporate mirror),
 * and that is not an error condition.
 */
export function parseRemoteUrl(input: string): (RepoRef & { host: string }) | null {
  const url = input.trim();
  if (!url) return null;

  // scp-like syntax: git@github.com:owner/repo.git — not a valid URL, match first.
  const scp = /^(?:([^@/]+)@)?([^:/]+):(?!\/)([^/]+)\/(.+)$/.exec(url);
  if (scp) {
    const [, , host, owner, repo] = scp as unknown as [string, string, string, string, string];
    return HOSTS.has(host.toLowerCase()) ? clean(owner, repo, host.toLowerCase()) : null;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // A bare `owner/repo` is a reasonable thing for a user to paste.
    const bare = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/.exec(url);
    return bare ? clean(bare[1]!, bare[2]!, "github.com") : null;
  }

  const proto = parsed.protocol.replace(":", "").toLowerCase();
  if (!["http", "https", "ssh", "git"].includes(proto)) return null;
  if (!HOSTS.has(parsed.hostname.toLowerCase())) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  return clean(segments[0]!, segments[1]!, parsed.hostname.toLowerCase());
}

/** Canonical https remote for a repo — used when offering an HTTPS push fallback. */
export function httpsRemoteUrl(repo: RepoRef): string {
  return `https://github.com/${repo.owner}/${repo.repo}.git`;
}
