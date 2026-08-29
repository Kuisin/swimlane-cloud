import { NextResponse } from "next/server";
import { assertCheckpointTarget } from "@swimlane-cloud/github-client";
import { readJson, requireRepoApis, toResponse } from "@/lib/api";
import { assertDiagramPath, assertRef, BadRequestError } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  branch: string;
  message?: string;
  files: { id: string; dsl: string }[];
  /** Optimistic concurrency: refuse if the branch has moved since we read it. */
  expectedHeadSha?: string;
}

/**
 * One git commit spanning every dirty path — the folder-level checkpoint.
 * Mirrors `apps/saas/app/api/projects/[projectId]/checkpoint/route.ts`,
 * including its refusal to commit directly to the production branch.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  try {
    const body = await readJson<Body>(req);
    if (!body.branch) throw new BadRequestError("branch is required.");
    assertRef(body.branch);
    // Throws for `main`. The guard lives in the shared branch model so the hub
    // and the extension cannot drift on what is writable.
    assertCheckpointTarget(body.branch);

    if (!Array.isArray(body.files) || body.files.length === 0) {
      throw new BadRequestError("Nothing to checkpoint.");
    }
    for (const f of body.files) assertDiagramPath(f.id.split("/"));

    const { write, login } = await requireRepoApis(owner, repo);
    const result = await write.commitFiles({
      branch: body.branch,
      message: body.message?.trim() || `Checkpoint ${body.files.length} diagram(s)`,
      files: body.files.map((f) => ({ path: f.id, text: f.dsl })),
      ...(body.expectedHeadSha ? { expectedHeadSha: body.expectedHeadSha } : {}),
    });

    return NextResponse.json({ commitSha: result.sha, branch: result.branch, by: login });
  } catch (err) {
    return toResponse(err);
  }
}
