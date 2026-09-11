import { NextResponse } from "next/server";
import { getGitLabInstance, isInstanceRegisteredBy } from "@/lib/gitlab-instances";
import { GITLAB_OAUTH_STATE_COOKIE, stateMatches } from "@/lib/oauth-state";
import { requireUser } from "@/lib/projects";
import { getServiceSupabase } from "@/lib/supabase/server";
import { sealToken } from "@/lib/token-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error_description?: string;
}

interface GitLabUser {
  id: number;
  username: string;
  email?: string;
}

export async function GET(req: Request) {
  const user = await requireUser().catch(() => null);
  const url = new URL(req.url);
  const fail = (reason: string) => NextResponse.redirect(`${url.origin}/dashboard?error=${reason}`);
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const stored = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${GITLAB_OAUTH_STATE_COOKIE}=`))
    ?.slice(GITLAB_OAUTH_STATE_COOKIE.length + 1);
  const [expectedState, instanceId, encodedNext] = decodeURIComponent(stored ?? "").split(":");
  const next = encodedNext ? decodeURIComponent(encodedNext) : "/dashboard";

  // CSRF: without this an attacker can complete the flow with their own code
  // and silently bind the victim's connection to the attacker's GitLab account.
  if (!code || !instanceId || !stateMatches(state ?? undefined, expectedState)) {
    return fail("gitlab_state");
  }

  const instance = await getGitLabInstance(instanceId);
  if (!instance) return fail("gitlab_instance");

  const tokenRes = await fetch(`${instance.host}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: instance.clientId,
      client_secret: instance.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: new URL("/api/gitlab/callback", url.origin).toString(),
    }),
    cache: "no-store",
  });
  const payload = (await tokenRes.json().catch(() => null)) as TokenResponse | null;
  if (!payload?.access_token || !payload.refresh_token) {
    return fail(encodeURIComponent(payload?.error_description ?? "gitlab_token"));
  }

  const who = await fetch(`${instance.host}/api/v4/user`, {
    headers: { Authorization: `Bearer ${payload.access_token}` },
    cache: "no-store",
  });
  const account = (await who.json().catch(() => null)) as GitLabUser | null;
  if (!account?.username) return fail("gitlab_user");

  const supabase = getServiceSupabase();
  const { error } = await supabase.from("gitlab_connections").upsert(
    {
      user_id: user.id,
      instance_id: instanceId,
      gitlab_login: account.username,
      gitlab_user_id: account.id,
      gitlab_email: account.email ?? "",
      access_token_ciphertext: sealToken(payload.access_token),
      refresh_token_ciphertext: sealToken(payload.refresh_token),
      token_expires_at: new Date(Date.now() + (payload.expires_in ?? 7200) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,instance_id" },
  );
  if (error) return fail("gitlab_connection");

  const isRegisteredByCaller =
    !instance.workspaceId && (await isInstanceRegisteredBy(instanceId, user.id));
  const dest = isRegisteredByCaller
    ? `/workspaces/new-gitlab?instanceId=${instanceId}&step=claim`
    : next.startsWith("/")
      ? next
      : "/dashboard";

  const res = NextResponse.redirect(new URL(dest, url.origin));
  res.cookies.delete(GITLAB_OAUTH_STATE_COOKIE);
  return res;
}
