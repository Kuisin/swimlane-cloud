import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Reads an env var, throwing a clear *runtime* error if missing. Never called
 * at module top-level so `next build` (no env, no network) does not throw.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `See .env.vercel.example and apps/saas/README.md.`,
    );
  }
  return value;
}

/**
 * Cookie-bound server client for use in Server Components / Route Handlers.
 * Respects the signed-in user's session and therefore RLS policies.
 */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[],
      ) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `set` throws in Server Components (read-only cookies). The session
          // is refreshed by middleware / route handlers instead — safe to ignore.
        }
      },
    },
  });
}

/**
 * Service-role client for privileged server operations (provisioning, writes
 * that intentionally bypass RLS). Never expose this to the browser.
 */
export function getServiceSupabase(): SupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Returns the authenticated user from the cookie-bound client, or null.
 */
export async function getCurrentUser() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
