import {
  INTEGRATION_BRANCH,
  PROD_BRANCH,
  REPO_CONFIG_PATH,
  slugify,
} from "@swimlane-cloud/github-client";
import { ApiError, withApi, json, readJson } from "@/lib/api";
import { ensureProject, getWorkspacePlanByOwner, PROJECT_TOPIC } from "@/lib/discovery";
import { withRepo } from "@/lib/github";
import { assertOwnerRepo } from "@/lib/guard";
import { assertPlanAllowsRepoCreation } from "@/lib/plans";
import { requireUserWithGitHub } from "@/lib/projects";
import { repoConfigJson, seedRepoFiles } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body =
  | { mode: "create"; owner: string; ownerType: "user" | "org"; name: string }
  | { mode: "mark"; owner: string; repo: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST /api/projects — create a new repository as a project, or mark an
 * existing one. Both end by registering the project row.
 *
 * create: new private repo (auto_init) → seed commit on main → test branch → topic.
 * mark:   admin-only; ensure main + test, add `.swimlane.json` if absent, add topic.
 */
export const POST = withApi(async (req) => {
  const ctx = await requireUserWithGitHub();
  const body = await readJson<Body>(req);
  const actor = { userId: ctx.user.id, login: ctx.login };

  if (body.mode === "create") {
    const name = slugify(body.name ?? "");
    if (!name || name === "untitled") throw new ApiError(400, "A repository name is required.");
    assertOwnerRepo(body.owner, name);
    if (body.ownerType === "user" && body.owner !== ctx.login) {
      throw new ApiError(
        403,
        "You can only create repositories under your own account or an organisation.",
      );
    }

    // Initialising a brand-new repository (seed commit, branches, templates)
    // is a paid-plan action; free-plan workspaces mark an existing repo
    // instead. Looked up before touching GitHub so a blocked request never
    // creates anything.
    const plan = await getWorkspacePlanByOwner(body.owner);
    assertPlanAllowsRepoCreation(plan);

    if (body.ownerType === "org") {
      // Anyone on a team plan can be a member, but only an org *admin* may
      // spend the org's quota by creating new repositories through the app.
      const membership = await ctx.repos.getOrgMembership(body.owner);
      if (!membership || membership.state !== "active" || membership.role !== "admin") {
        throw new ApiError(
          403,
          `Only a team admin of ${body.owner} can create new repositories here.`,
        );
      }
    }

    const created = await ctx.repos.createRepo({
      name,
      ...(body.ownerType === "org" ? { org: body.owner } : {}),
      private: true,
      autoInit: true,
      description: "kai-swimlane diagrams, managed with Swimlane Cloud",
    });
    const { write, commitAuthorEmail } = withRepo(ctx, {
      owner: created.owner,
      repo: created.name,
    });

    // auto_init's first commit lands asynchronously; the Git Data API needs it.
    let ready = false;
    for (let i = 0; i < 10 && !ready; i++) {
      try {
        await write.refSha(created.defaultBranch);
        ready = true;
      } catch {
        await sleep(500);
      }
    }
    if (!ready)
      throw new ApiError(
        502,
        "GitHub did not initialise the repository in time. Retry in a moment.",
      );

    await write.commitFiles({
      branch: created.defaultBranch,
      message: "Seed diagrams, section templates and .swimlane.json",
      files: seedRepoFiles(created.name),
      author: { name: ctx.login, email: commitAuthorEmail },
    });
    if (created.defaultBranch !== PROD_BRANCH) {
      await write.ensureBranch(PROD_BRANCH, created.defaultBranch);
    }
    await write.ensureBranch(INTEGRATION_BRANCH, PROD_BRANCH);
    await ctx.repos.addTopic(created.owner, created.name, PROJECT_TOPIC);

    const info = await ctx.repos.getRepo(created.owner, created.name);
    const result = await ensureProject(info, actor);
    return json({ projectId: result.projectId, htmlUrl: info.htmlUrl }, 201);
  }

  if (body.mode === "mark") {
    assertOwnerRepo(body.owner, body.repo);
    const info = await ctx.repos.getRepo(body.owner, body.repo);
    if (!info.permissions.admin) {
      throw new ApiError(403, "Only a repository admin can mark it as a swimlane project.");
    }
    const { write, rest } = withRepo(ctx, { owner: info.owner, repo: info.name });

    if (info.defaultBranch !== PROD_BRANCH)
      await write.ensureBranch(PROD_BRANCH, info.defaultBranch);
    await write.ensureBranch(INTEGRATION_BRANCH, PROD_BRANCH);

    let hasConfig = true;
    try {
      await rest.request(
        `/repos/${info.owner}/${info.name}/contents/${REPO_CONFIG_PATH}?ref=${INTEGRATION_BRANCH}`,
      );
    } catch {
      hasConfig = false;
    }
    if (!hasConfig) {
      // Unknown layout: root the diagram tree at the repository root.
      await write.putFile(
        REPO_CONFIG_PATH,
        repoConfigJson(info.name, ""),
        INTEGRATION_BRANCH,
        "Add .swimlane.json",
      );
    }
    await ctx.repos.addTopic(info.owner, info.name, PROJECT_TOPIC);

    const marked = await ctx.repos.getRepo(info.owner, info.name);
    const result = await ensureProject(marked, actor);
    return json({ projectId: result.projectId, htmlUrl: marked.htmlUrl }, 201);
  }

  throw new ApiError(400, "mode must be create or mark");
});
