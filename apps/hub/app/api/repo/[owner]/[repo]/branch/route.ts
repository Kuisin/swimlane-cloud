import { NextResponse } from "next/server";
import { INTEGRATION_BRANCH, PROD_BRANCH, tmpBranchName } from "@swimlane-cloud/github-client";
import { readJson, requireRepoApis, toResponse } from "@/lib/api";
import { BadRequestError } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  /** Human name for the edit; the tmp branch name is derived from it. */
  editName: string;
  /** Create the integration branch from production if it does not exist yet. */
  createIntegration?: boolean;
}

/**
 * Start an edit: cut `tmp-<user>-<slug>` from the integration branch.
 *
 * An arbitrary GitHub repository almost never has a `test` branch — this one
 * does not either — so rather than silently collapsing to a two-branch model
 * (which would make a merged PR publish straight to production), the route
 * reports the situation and offers to create it from the default branch.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  try {
    const body = await readJson<Body>(req);
    if (!body.editName?.trim()) throw new BadRequestError("editName is required.");

    const { write, login } = await requireRepoApis(owner, repo);

    let integrationExists = true;
    try {
      await write.refSha(INTEGRATION_BRANCH);
    } catch {
      integrationExists = false;
    }

    if (!integrationExists) {
      if (!body.createIntegration) {
        return NextResponse.json(
          {
            error: `This repository has no "${INTEGRATION_BRANCH}" branch.`,
            needsIntegrationBranch: true,
            integrationBranch: INTEGRATION_BRANCH,
            from: PROD_BRANCH,
          },
          { status: 409 },
        );
      }
      // Mirrors apps/saas/app/api/workspaces/route.ts:102.
      await write.ensureBranch(INTEGRATION_BRANCH, PROD_BRANCH);
    }

    const branch = tmpBranchName(login, body.editName);
    await write.ensureBranch(branch, INTEGRATION_BRANCH);
    const sha = await write.refSha(branch);

    return NextResponse.json({ branch, sha, base: INTEGRATION_BRANCH });
  } catch (err) {
    return toResponse(err);
  }
}
