import { NextResponse, type NextRequest } from "next/server";
import { createReposApi, createRestClient } from "@swimlane-cloud/github-client";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { sealToken } from "@/lib/token-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Same-origin paths only. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

/**
 * OAuth callback. Supabase redirects here with a `code`; exchanging it sets the
 * session cookies *and* — this once only — hands us the GitHub access token
 * as `session.provider_token`. It is never available again on a refreshed
 * session, so it is captured here, encrypted, and stored per user. Every
 * GitHub call the app makes later runs with this token.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const fail = (reason: string) => NextResponse.redirect(`${origin}/login?error=${reason}`);

  if (!code) return fail("auth");

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session || !data.user) return fail("auth");

  const providerToken = data.session.provider_token;
  const service = getServiceSupabase();

  if (providerToken) {
    try {
      const rest = createRestClient({
        getToken: () => providerToken,
        fetchImpl: (url, init) => fetch(url, { ...init, cache: "no-store" }),
      });
      const account = await createReposApi(rest).getAuthenticatedUser();
      const { error: upsertErr } = await service.from("github_connections").upsert(
        {
          user_id: data.user.id,
          github_login: account.login,
          github_user_id: account.id,
          token_ciphertext: sealToken(providerToken),
          scopes: "repo",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (upsertErr) throw new Error(upsertErr.message);
    } catch (err) {
      console.error("[auth/callback] could not store GitHub token", err);
      return fail("github_token");
    }
  } else {
    // Supabase may omit the provider token on a repeat sign-in; that is fine
    // as long as a usable one is already on file.
    const { data: existing } = await service
      .from("github_connections")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (!existing) return fail("github_token");
  }

  return NextResponse.redirect(`${origin}${next}`);
}
