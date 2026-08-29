import { NextResponse } from "next/server";
import { GitHubNotAccessibleError } from "@swimlane-cloud/github-client";
import { getReader } from "@/lib/repo";
import {
  assertDiagramPath,
  assertOwnerAllowed,
  assertOwnerRepo,
  assertRef,
  BadRequestError,
} from "@/lib/guard";

export const runtime = "nodejs";

/**
 * A release URL redirects to the canonical sha URL rather than serving content
 * itself.
 *
 * The reason is that tags are NOT immutable: `git tag -f` plus a force push
 * relocates one. Serving `/t/{tag}` with `Cache-Control: immutable` would pin
 * whatever we saw first, forever, with no way to bust it. Only a commit sha is
 * genuinely fixed, so the tag is resolved on every (short-lived) request and
 * the immutability lives entirely on `/c/{sha}`.
 *
 * Annotated tags point at a tag object rather than a commit, so the reader
 * peels them — a tag-object sha cannot be read as a tree.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; tag: string; path: string[] }> },
) {
  const { owner, repo, tag, path } = await params;
  try {
    assertOwnerRepo(owner, repo);
    assertOwnerAllowed(owner);
    assertRef(tag);
    const filePath = assertDiagramPath(path);

    const reader = await getReader(owner, repo);
    const resolved = await reader.resolveRef(tag);

    const res = NextResponse.redirect(
      new URL(`/${owner}/${repo}/c/${resolved.sha}/${filePath}`, _req.url),
      302,
    );
    // Short: the tag could be moved. The destination carries the long cache.
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=86400");
    return res;
  } catch (err) {
    if (err instanceof BadRequestError) return new NextResponse(err.message, { status: 400 });
    if (err instanceof GitHubNotAccessibleError) {
      // Saying "tag not found" would be misleading when the whole repository is
      // simply unreadable without credentials.
      if (err.authWouldHelp) {
        return new NextResponse(
          `${owner}/${repo} is private. Sign in at /api/auth/login to view its releases.`,
          { status: 401 },
        );
      }
      return new NextResponse(`Tag "${tag}" not found in ${owner}/${repo}.`, { status: 404 });
    }
    throw err;
  }
}
