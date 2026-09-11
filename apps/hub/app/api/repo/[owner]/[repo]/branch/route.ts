import { NextResponse } from "next/server";
import { editBranchName, INTEGRATION_BRANCH, PROD_BRANCH } from "@swimlane-cloud/github-client";
import { readJson, requireRepoApis, toResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  /**
   * Accepted for backward compatibility with older clients; ignored. The
   * branch name is derived from the signed-in login, a timestamp and a
   * random key, not from anything the caller supplies.
   */
  editName?: string;
  /** Create the integration branch from production if it does not exist yet. */
  createIntegration?: boolean;
}

/**
 * Start an edit: cut `<login>/<timestamp>/<key>` from the integration branch.
 *
 * An arbitrary GitHub repository almost never has a `preview` branch — this
 * one does not either — so rather than silently collapsing to a two-branch
 * model (which would make a merged PR publish straight to production), the
 * route reports the situation and offers to create it from the default
 * branch.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  try {
    const body = await readJson<Body>(req).catch(() => ({}) as Body);

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

    const branch = editBranchName(login);
    await write.ensureBranch(branch, INTEGRATION_BRANCH);
    const sha = await write.refSha(branch);

    return NextResponse.json({ branch, sha, base: INTEGRATION_BRANCH });
  } catch (err) {
    return toResponse(err);
  }
}
