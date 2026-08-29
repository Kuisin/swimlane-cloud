import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

/**
 * POST only: a GET logout is trivially triggered by any third-party image tag.
 * Nothing is stored server-side, so dropping the cookie IS the logout.
 */
export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/", new URL(req.url).origin), 302);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
