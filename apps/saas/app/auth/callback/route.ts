import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Magic-link / OAuth callback. Supabase redirects here with a `code` which we
 * exchange for a session (sets the auth cookies via the SSR client), then send
 * the user on to `next` (default /dashboard). Using request `origin` keeps this
 * correct on localhost, preview, and production without hardcoding a host.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
