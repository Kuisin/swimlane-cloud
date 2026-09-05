import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST only: a GET sign-out could be triggered by any `<img>` tag. The stored
 * GitHub token is kept — it is re-sealed on the next sign-in anyway, and
 * deleting it would not revoke it on GitHub.
 */
export async function POST(request: Request) {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
