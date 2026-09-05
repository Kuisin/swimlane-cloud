import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh + sign-in gate for the app pages.
 *
 * Server Components cannot write cookies, so without this the Supabase session
 * would silently expire after an hour and every page would start 401-ing.
 * Runs on the edge: only `@supabase/ssr` and `next/server` are imported here.
 *
 * With no Supabase env at all the request passes through untouched — a
 * preview deploy without secrets still serves the landing page, and
 * `next build` never touches the environment.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() validates against the auth server and refreshes the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { pathname, search } = request.nextUrl;
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/projects/:path*", "/new"],
};
