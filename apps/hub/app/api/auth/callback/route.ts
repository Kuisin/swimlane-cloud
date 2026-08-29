import { NextResponse } from "next/server";
import {
  isSessionConfigured,
  OAUTH_STATE_COOKIE,
  sealSession,
  SESSION_COOKIE,
  stateMatches,
} from "@/lib/session";

export const runtime = "nodejs";

/** Matches GitHub's default token lifetime for OAuth Apps closely enough. */
const SESSION_DAYS = 7;

export async function GET(req: Request) {
  if (!isSessionConfigured()) {
    return new NextResponse("Sign-in is not configured on this deployment.", { status: 501 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const stored = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.slice(OAUTH_STATE_COOKIE.length + 1);

  const [expectedState, next = "/"] = decodeURIComponent(stored ?? "").split(":");

  // CSRF: without this an attacker can complete the flow with their own code
  // and silently bind the victim's browser to the attacker's GitHub account.
  if (!code || !stateMatches(state ?? undefined, expectedState)) {
    return NextResponse.redirect(new URL("/?error=Sign-in+failed+or+expired.", url.origin), 302);
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: new URL("/api/auth/callback", url.origin).toString(),
    }),
    cache: "no-store",
  });

  const payload = (await tokenRes.json().catch(() => null)) as {
    access_token?: string;
    error_description?: string;
  } | null;

  if (!payload?.access_token) {
    const reason = payload?.error_description ?? "GitHub did not return a token.";
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(reason)}`, url.origin), 302);
  }

  const who = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${payload.access_token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  const login = ((await who.json().catch(() => ({}))) as { login?: string }).login ?? "unknown";

  const res = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", url.origin), 302);
  res.cookies.set(
    SESSION_COOKIE,
    sealSession({
      token: payload.access_token,
      login,
      exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400,
    }),
    {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    },
  );
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}
