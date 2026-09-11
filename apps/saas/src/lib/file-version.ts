/**
 * Version tokens for file text, shared by the API routes that produce them
 * and the browser cache that keys on them.
 *
 * A file's text on a branch is fixed by exactly one of two things: the commit
 * the branch points at (`git:<sha>`), or — when an uncommitted draft overlays
 * it — the draft's `updated_at` (`draft:<iso timestamp>`). Both are immutable
 * identifiers of a specific text, so text cached under such a token can be
 * served again without a request, provided the token itself came from a
 * fresh tree listing. The listing is what changes; the text under a token
 * never does.
 *
 * Browser-safe on purpose: no server import, so `saas-host.ts` can use it.
 */
import type { TreeResponse } from "./types";

const SHA_RE = /^[0-9a-f]{40}$/;

export function isCommitSha(ref: string): boolean {
  return SHA_RE.test(ref);
}

export function gitVersion(sha: string): string {
  return `git:${sha}`;
}

export function draftVersion(updatedAt: string): string {
  return `draft:${updatedAt}`;
}

/**
 * The version token a file has according to a tree listing, or null when the
 * listing does not include the path (deleted, renamed away, or never there —
 * in every case the caller must ask the server rather than trust a cache).
 */
export function fileVersionIn(
  tree: Pick<TreeResponse, "sha" | "files" | "drafts">,
  path: string,
): string | null {
  if (!tree.files.some((f) => f.id === path)) return null;
  const draftedAt = tree.drafts?.[path];
  return draftedAt ? draftVersion(draftedAt) : gitVersion(tree.sha);
}
