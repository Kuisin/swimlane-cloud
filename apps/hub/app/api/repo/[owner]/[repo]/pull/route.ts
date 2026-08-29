import { NextResponse } from "next/server";
import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { readJson, requireRepoApis, toResponse } from "@/lib/api";
import { assertRef, BadRequestError } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  head: string;
  base?: string;
  title?: string;
  body?: string;
}

/**
 * Open a review for an edit branch. The base defaults to the integration
 * branch and `assertMergeTarget` inside the client refuses `tmp-* -> main`
 * regardless of what the caller asks for.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  try {
    const body = await readJson<Body>(req);
    if (!body.head) throw new BadRequestError("head is required.");
    assertRef(body.head);
    const base = body.base ?? INTEGRATION_BRANCH;
    assertRef(base);

    const { pulls } = await requireRepoApis(owner, repo);

    // Reuse an open PR for this branch rather than opening a second one.
    const existing = await pulls.listPullRequests({ head: body.head, state: "open" });
    if (existing.length > 0) return NextResponse.json({ pull: existing[0], reused: true });

    const pull = await pulls.createPullRequest({
      head: body.head,
      base,
      title: body.title?.trim() || `Update diagrams (${body.head})`,
      ...(body.body ? { body: body.body } : {}),
    });
    return NextResponse.json({ pull, reused: false });
  } catch (err) {
    return toResponse(err);
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  try {
    const head = new URL(req.url).searchParams.get("head");
    const { pulls } = await requireRepoApis(owner, repo);
    return NextResponse.json({
      pulls: await pulls.listPullRequests({ state: "open", ...(head ? { head } : {}) }),
    });
  } catch (err) {
    return toResponse(err);
  }
}
