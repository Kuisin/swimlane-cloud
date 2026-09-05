import { withApi, json } from "@/lib/api";
import { getGitHubConnection } from "@/lib/github";
import { requireUser } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/me — who is signed in, and whether a GitHub token is on file. */
export const GET = withApi(async () => {
  const user = await requireUser();
  const connection = await getGitHubConnection(user.id);
  return json({
    user: { id: user.id, email: user.email ?? null },
    github: connection
      ? { login: connection.login, connected: true }
      : { login: null, connected: false },
  });
});
