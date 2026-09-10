import { NextResponse } from "next/server";
import { INTEGRATION_BRANCH, isWithinRoot, parseRepoConfig } from "@swimlane-cloud/github-client";
import { requireRepoApis, toResponse } from "@/lib/api";
import { assertRef } from "@/lib/guard";
import { isDiagramPath } from "@/lib/diagram-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recursive diagram listing at a branch, scoped to the configured diagrams root. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  try {
    const branch = new URL(req.url).searchParams.get("branch") ?? INTEGRATION_BRANCH;
    assertRef(branch);
    const { rest, write } = await requireRepoApis(owner, repo);

    const head = await rest.request<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    const { entries, truncated } = await write.listTree(head.object.sha);

    let config = parseRepoConfig(null);
    const configEntry = entries.find((e) => e.path === ".swimlane.json");
    if (configEntry) {
      const raw = await rest.requestText(
        `/repos/${owner}/${repo}/contents/.swimlane.json?ref=${head.object.sha}`,
        { accept: "application/vnd.github.raw", immutable: true },
      );
      config = parseRepoConfig(raw);
    }

    const files = entries
      .filter((e) => e.type === "blob" && isDiagramPath(e.path) && isWithinRoot(config, e.path))
      .map((e) => ({ id: e.path, name: e.path }));

    return NextResponse.json({ files, sha: head.object.sha, config, truncated });
  } catch (err) {
    return toResponse(err);
  }
}
