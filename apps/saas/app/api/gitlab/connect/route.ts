import { NextResponse } from "next/server";
import { getGitLabInstance } from "@/lib/gitlab-instances";
import { requireUser } from "@/lib/projects";
import { GITLAB_OAUTH_STATE_COOKIE, newOauthState } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Same-origin paths only — this cannot be turned into an open redirect. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

/**
 * GET /api/gitlab/connect?instanceId=&next= — start the OAuth dance against
 * one org's registered GitLab instance. Bypasses Supabase Auth entirely: see
 * src/lib/gitlab.ts's module comment for why.
 */
export async function GET(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const instanceId = url.searchParams.get("instanceId");
  if (!instanceId) return new NextResponse("instanceId is required", { status: 400 });
  const instance = await getGitLabInstance(instanceId);
  if (!instance) return new NextResponse("GitLab instance not found", { status: 404 });

  const next = safeNext(url.searchParams.get("next"));
  const state = newOauthState();

  const authorize = new URL(`${instance.host}/oauth/authorize`);
  authorize.searchParams.set("client_id", instance.clientId);
  authorize.searchParams.set(
    "redirect_uri",
    new URL("/api/gitlab/callback", url.origin).toString(),
  );
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "api");
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize.toString(), 302);
  // The state cookie carries instanceId + the return path too, so no server
  // store is needed between this request and the callback.
  res.cookies.set(GITLAB_OAUTH_STATE_COOKIE, `${state}:${instanceId}:${encodeURIComponent(next)}`, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
