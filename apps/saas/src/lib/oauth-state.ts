/**
 * CSRF state for the GitLab connect/callback round trip.
 *
 * apps/saas has no existing state-cookie helper: GitHub sign-in is delegated
 * to Supabase Auth, which handles its own CSRF internally. The GitLab connect
 * flow bypasses Supabase Auth entirely (see src/lib/gitlab.ts's module
 * comment), so it needs its own — mirrors apps/hub/src/lib/session.ts's
 * `newOauthState`/`stateMatches` exactly.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

export const GITLAB_OAUTH_STATE_COOKIE = "sw_gitlab_oauth_state";

export function newOauthState(): string {
  return randomBytes(16).toString("base64url");
}

/** Constant-time, so a mismatched state cannot be probed byte by byte. */
export function stateMatches(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
