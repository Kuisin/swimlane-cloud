/**
 * The session cookie.
 *
 * "Stateless, no secrets" cannot be literally true alongside GitHub OAuth: the
 * code-for-token exchange requires a client secret, and GitHub OAuth Apps do
 * not support PKCE. What IS achievable, and what this implements, is **no
 * per-user secret at rest and no database**: the client secret lives in env,
 * the user's token lives only in their own cookie, and the server persists
 * nothing.
 *
 * The token is encrypted rather than merely signed. A signed-but-readable
 * cookie would put a live GitHub token into anything that ever sees the header
 * — a proxy log, a crash dump, a misconfigured CDN, a browser extension. AES-256-GCM
 * costs ~20 lines and removes that entire class of exposure.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_COOKIE = "sw_gh";
export const OAUTH_STATE_COOKIE = "sw_oauth_state";

export interface Session {
  token: string;
  login: string;
  /** Unix seconds. Independent of the cookie's own Max-Age. */
  exp: number;
}

class MissingSecretError extends Error {}

/**
 * Derived from SESSION_SECRET at call time, never at module load: `next build`
 * must succeed with no environment at all, matching apps/saas.
 */
function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new MissingSecretError(
      "SESSION_SECRET must be set to at least 32 characters for sign-in to work.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function isSessionConfigured(): boolean {
  return Boolean(
    process.env.SESSION_SECRET &&
    process.env.SESSION_SECRET.length >= 32 &&
    process.env.GITHUB_CLIENT_ID &&
    process.env.GITHUB_CLIENT_SECRET,
  );
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function sealSession(session: Session): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

/** Returns null for anything tampered with, expired, or encrypted under an old secret. */
export function openSession(raw: string | undefined | null): Session | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;

  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(parts[1]!, "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2]!, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(parts[3]!, "base64url")),
      decipher.final(),
    ]).toString("utf8");

    const session = JSON.parse(plain) as Session;
    if (typeof session.token !== "string" || typeof session.exp !== "number") return null;
    if (session.exp * 1000 < Date.now()) return null;
    return session;
  } catch {
    // GCM auth failure, malformed base64, bad JSON, or a rotated secret —
    // all mean the same thing to a caller: no usable session.
    return null;
  }
}

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
