import { NextResponse } from "next/server";
import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { requireRepoApis, toResponse } from "@/lib/api";
import { assertDiagramPath, assertRef, BadRequestError } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  try {
    const url = new URL(req.url);
    const branch = url.searchParams.get("branch") ?? INTEGRATION_BRANCH;
    const path = url.searchParams.get("path");
    if (!path) throw new BadRequestError("path is required.");
    assertRef(branch);
    assertDiagramPath(path.split("/"));

    const { rest } = await requireRepoApis(owner, repo);
    const dsl = await rest.requestText(
      `/repos/${owner}/${repo}/contents/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}?ref=${encodeURIComponent(branch)}`,
      { accept: "application/vnd.github.raw" },
    );
    return NextResponse.json({ dsl });
  } catch (err) {
    return toResponse(err);
  }
}
