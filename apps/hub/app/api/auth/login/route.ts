import { NextResponse } from "next/server";
import { isSessionConfigured, newOauthState, OAUTH_STATE_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

/** Only what we need to read private repos the user already has access to. */
const SCOPES = "repo";

/**
 * Start the OAuth dance. The `next` parameter is validated as a same-origin
 * path so this cannot be turned into an open redirect.
 */
export async function GET(req: Request) {
  if (!isSessionConfigured()) {
    return new NextResponse(
      "Sign-in is not configured on this deployment (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET).",
      { status: 501 },
    );
  }

  const url = new URL(req.url);
  const requested = url.searchParams.get("next") ?? "/";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  const state = newOauthState();
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
  authorize.searchParams.set("redirect_uri", new URL("/api/auth/callback", url.origin).toString());
  authorize.searchParams.set("scope", SCOPES);
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize.toString(), 302);
  // The state cookie carries the return path too, so we need no server store.
  res.cookies.set(OAUTH_STATE_COOKIE, `${state}:${next}`, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
