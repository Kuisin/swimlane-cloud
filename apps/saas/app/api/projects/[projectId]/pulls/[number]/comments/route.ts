import { withApi, json, readJson, ApiError } from "@/lib/api";
import { parsePullNumber } from "@/lib/guard";
import { requireProjectRole } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST {body} — comment on the pull request's conversation, as the signed-in GitHub user. */
export const POST = withApi(
  async (req, ctx: { params: Promise<{ projectId: string; number: string }> }) => {
    const { projectId, number } = await ctx.params;
    const n = parsePullNumber(number);
    const { body } = await readJson<{ body?: string }>(req);
    if (!body?.trim()) throw new ApiError(400, "body is required");
    const project = await requireProjectRole(projectId, "viewer");
    if (project.project.provider !== "github") {
      throw new ApiError(
        400,
        "Pull request review is only available for GitHub-backed projects in this release.",
      );
    }
    const comment = await project.pulls.createIssueComment(n, body.trim());
    return json({ comment }, 201);
  },
);
