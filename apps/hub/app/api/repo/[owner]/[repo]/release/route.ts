import { NextResponse } from "next/server";
import { PROD_BRANCH } from "@swimlane-cloud/github-client";
import { readJson, requireRepoApis, toResponse } from "@/lib/api";
import { BadRequestError } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  tag: string;
  name?: string;
  notes?: string;
}

/**
 * Cut a release: tag the tip of the production branch.
 *
 * Only released versions get a pinned public URL, and a release can only be cut
 * from production — so the tag target is read from the server rather than
 * accepted from the caller. The resulting `/t/{tag}/` URL redirects to the
 * immutable `/c/{sha}/` one.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  try {
    const body = await readJson<Body>(req);
    const tag = body.tag?.trim();
    if (!tag) throw new BadRequestError("tag is required.");
    if (!/^[\w.\-+]{1,100}$/.test(tag)) throw new BadRequestError(`Invalid tag "${tag}".`);

    const { write } = await requireRepoApis(owner, repo);
    const target = await write.refSha(PROD_BRANCH);
    const release = await write.createRelease(tag, {
      ...(body.name ? { name: body.name } : {}),
      ...(body.notes ? { body: body.notes } : {}),
      target: PROD_BRANCH,
    });

    return NextResponse.json({
      release,
      sha: target,
      url: `/${owner}/${repo}/t/${encodeURIComponent(tag)}/`,
    });
  } catch (err) {
    return toResponse(err);
  }
}
