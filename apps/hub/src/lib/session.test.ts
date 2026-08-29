import { beforeEach, describe, expect, it } from "vitest";
import {
  isSessionConfigured,
  newOauthState,
  openSession,
  sealSession,
  stateMatches,
  type Session,
} from "./session.ts";

const SECRET = "a".repeat(48);
const future = () => Math.floor(Date.now() / 1000) + 3600;

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});

describe("seal/open", () => {
  it("round-trips a session", () => {
    const s: Session = { token: "gho_secret", login: "kuisin", exp: future() };
    expect(openSession(sealSession(s))).toEqual(s);
  });

  it("does not leave the token readable in the cookie value", () => {
    // A signed-but-readable cookie would expose a live GitHub token to every
    // proxy log and crash dump that ever sees the header.
    const sealed = sealSession({ token: "gho_supersecret", login: "u", exp: future() });
    expect(sealed).not.toContain("gho_supersecret");
    expect(Buffer.from(sealed, "utf8").toString("base64")).not.toContain("gho_supersecret");
  });

  it("rejects a tampered ciphertext", () => {
    const sealed = sealSession({ token: "t", login: "u", exp: future() });
    const parts = sealed.split(".");
    const body = Buffer.from(parts[3]!, "base64url");
    body[0] ^= 0xff;
    parts[3] = body.toString("base64url");
    expect(openSession(parts.join("."))).toBeNull();
  });

  it("rejects a session sealed under a different secret", () => {
    const sealed = sealSession({ token: "t", login: "u", exp: future() });
    process.env.SESSION_SECRET = "b".repeat(48);
    expect(openSession(sealed)).toBeNull();
  });

  it("rejects an expired session even though the ciphertext is valid", () => {
    const sealed = sealSession({ token: "t", login: "u", exp: Math.floor(Date.now() / 1000) - 1 });
    expect(openSession(sealed)).toBeNull();
  });

  it("returns null for junk rather than throwing", () => {
    for (const junk of [undefined, null, "", "nope", "v1.a.b", "v2.a.b.c"]) {
      expect(openSession(junk)).toBeNull();
    }
  });

  it("refuses to seal without an adequate secret", () => {
    process.env.SESSION_SECRET = "tooshort";
    expect(() => sealSession({ token: "t", login: "u", exp: future() })).toThrow(/SESSION_SECRET/);
  });
});

describe("isSessionConfigured", () => {
  it("requires all three variables, so the app can degrade instead of half-working", () => {
    process.env.GITHUB_CLIENT_ID = "id";
    process.env.GITHUB_CLIENT_SECRET = "secret";
    expect(isSessionConfigured()).toBe(true);
    delete process.env.GITHUB_CLIENT_SECRET;
    expect(isSessionConfigured()).toBe(false);
  });
});

describe("oauth state", () => {
  it("generates distinct states", () => {
    expect(newOauthState()).not.toBe(newOauthState());
  });

  it("matches only exact values", () => {
    const s = newOauthState();
    expect(stateMatches(s, s)).toBe(true);
    expect(stateMatches(s, `${s}x`)).toBe(false);
    expect(stateMatches(s, undefined)).toBe(false);
    expect(stateMatches(undefined, undefined)).toBe(false);
  });
});
