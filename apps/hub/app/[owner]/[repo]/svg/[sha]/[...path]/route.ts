import { NextResponse } from "next/server";
import { GitHubNotAccessibleError, GitHubRateLimitError } from "@swimlane-cloud/github-client";
import { getReader } from "@/lib/repo";
import { render } from "@/lib/render";
import {
  assertDiagramPath,
  assertOwnerAllowed,
  assertOwnerRepo,
  assertSha,
  BadRequestError,
} from "@/lib/guard";

export const runtime = "nodejs";

/**
 * The rendered SVG on its own, for embedding in a README or a wiki.
 *
 * Lives under `/svg/{sha}/` rather than the planned `/c/{sha}/{path}.svg`
 * because App Router cannot host both a `page.tsx` and a `route.ts` at one
 * path, and a `.svg` suffix inside a catch-all is indistinguishable from part
 * of the filename. Same guarantee either way: sha-addressed, so immutable.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; sha: string; path: string[] }> },
) {
  const { owner, repo, sha, path } = await params;
  try {
    assertOwnerRepo(owner, repo);
    assertOwnerAllowed(owner);
    assertSha(sha);
    const filePath = assertDiagramPath(path);

    const reader = await getReader(owner, repo);
    const [blob, config] = await Promise.all([
      reader.readFile(filePath, sha),
      reader.readConfig(sha),
    ]);
    if (!blob) return new NextResponse("Not found", { status: 404 });

    const { svg } = render(blob.text, config.themeKey);
    if (!svg) return new NextResponse("This diagram could not be rendered.", { status: 422 });

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        // Safe only because the URL is sha-addressed.
        "Cache-Control": "public, max-age=31536000, immutable",
        // The renderer escapes its inputs and emits no href/script/external
        // refs, but this is served on our origin — deny it any capability.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof BadRequestError) return new NextResponse(err.message, { status: 400 });
    if (err instanceof GitHubNotAccessibleError)
      return new NextResponse("Not found", { status: 404 });
    if (err instanceof GitHubRateLimitError) {
      const res = new NextResponse("GitHub rate limit reached; try again shortly.", {
        status: 503,
      });
      if (err.retryAfterSeconds) res.headers.set("Retry-After", String(err.retryAfterSeconds));
      return res;
    }
    throw err;
  }
}
