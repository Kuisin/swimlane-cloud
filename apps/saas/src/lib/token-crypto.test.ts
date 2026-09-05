import { beforeEach, describe, expect, it } from "vitest";
import { isTokenCryptoConfigured, openToken, sealToken } from "./token-crypto";

const KEY = "a".repeat(48);

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
});

describe("seal/open", () => {
  it("round-trips a token", () => {
    expect(openToken(sealToken("gho_secret"))).toBe("gho_secret");
  });

  it("does not leave the token readable in the stored value", () => {
    const sealed = sealToken("gho_supersecret");
    expect(sealed).not.toContain("gho_supersecret");
    expect(Buffer.from(sealed, "utf8").toString("base64")).not.toContain("gho_supersecret");
  });

  it("rejects a tampered ciphertext", () => {
    const parts = sealToken("t").split(".");
    const body = Buffer.from(parts[3]!, "base64url");
    body[0] ^= 0xff;
    parts[3] = body.toString("base64url");
    expect(openToken(parts.join("."))).toBeNull();
  });

  it("rejects a token sealed under a different key", () => {
    const sealed = sealToken("t");
    process.env.TOKEN_ENCRYPTION_KEY = "b".repeat(48);
    expect(openToken(sealed)).toBeNull();
  });

  it("returns null for junk rather than throwing", () => {
    for (const junk of [undefined, null, "", "nope", "v1.a.b", "v2.a.b.c"]) {
      expect(openToken(junk)).toBeNull();
    }
  });

  it("refuses to seal without an adequate key", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "tooshort";
    expect(isTokenCryptoConfigured()).toBe(false);
    expect(() => sealToken("t")).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });
});
