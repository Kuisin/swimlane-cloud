import { withApi, json } from "@/lib/api";
import { requireUserWithGitHub } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/github/owners — accounts a new repository can be created under. */
export const GET = withApi(async () => {
  const { repos } = await requireUserWithGitHub();
  const [me, orgs] = await Promise.all([repos.getAuthenticatedUser(), repos.listUserOrgs()]);
  return json({
    owners: [
      { login: me.login, type: "user", avatarUrl: me.avatarUrl },
      ...orgs.map((o) => ({ login: o.login, type: "org", avatarUrl: o.avatarUrl })),
    ],
  });
});
