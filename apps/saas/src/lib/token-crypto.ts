/**
 * At-rest encryption for the per-user GitHub token.
 *
 * Supabase hands the token to us exactly once, on the OAuth callback; after
 * that it exists only in `github_connections.token_ciphertext`. Storing it
 * encrypted (rather than relying on RLS alone) means a database dump, a
 * misconfigured policy or a leaked service key does not become a pile of live
 * `repo`-scoped tokens. Same construction as `apps/hub/src/lib/session.ts`.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Derived from TOKEN_ENCRYPTION_KEY at call time, never at module load:
 * `next build` must succeed with no environment at all.
 */
function key(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be set to at least 32 characters for GitHub sign-in to work.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function isTokenCryptoConfigured(): boolean {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  return Boolean(secret && secret.length >= 32);
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function sealToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

/** Returns null for anything tampered with or sealed under a different key. */
export function openToken(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(parts[1]!, "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2]!, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(parts[3]!, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return plain || null;
  } catch {
    // GCM auth failure, malformed base64 or a rotated key — no usable token.
    return null;
  }
}
