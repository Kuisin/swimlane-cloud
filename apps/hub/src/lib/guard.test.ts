import { describe, expect, it } from "vitest";
import {
  assertDiagramPath,
  assertOwnerAllowed,
  assertOwnerRepo,
  assertRef,
  assertSha,
  BadRequestError,
} from "./guard.ts";

describe("assertOwnerRepo", () => {
  it("accepts real GitHub names", () => {
    expect(() => assertOwnerRepo("facebook", "react")).not.toThrow();
    expect(() => assertOwnerRepo("Kuisin", "swimlane-cloud")).not.toThrow();
    expect(() => assertOwnerRepo("a-b-c", "my.repo_v2")).not.toThrow();
  });

  it("rejects traversal and injection attempts", () => {
    const bad: Array<[string, string]> = [
      ["..", "react"],
      ["face/book", "react"],
      ["facebook", "../../etc/passwd"],
      ["-leading", "react"],
      ["facebook", ""],
    ];
    for (const [o, r] of bad) expect(() => assertOwnerRepo(o, r)).toThrow(BadRequestError);
  });
});

describe("assertSha", () => {
  it("requires a full 40-char sha — a short sha is not immutable enough to cache forever", () => {
    expect(() => assertSha("6348a075bd6df5fe05395f596d3c9d0c74e39aba")).not.toThrow();
    expect(() => assertSha("6348a07")).toThrow(BadRequestError);
    expect(() => assertSha("main")).toThrow(BadRequestError);
    expect(() => assertSha("Z".repeat(40))).toThrow(BadRequestError);
  });
});

describe("assertRef", () => {
  it("accepts ordinary tag and branch names", () => {
    for (const r of ["v1.0.0", "release/2024", "main", "1.0.0"]) {
      expect(() => assertRef(r)).not.toThrow();
    }
  });

  it("rejects names git itself forbids", () => {
    for (const r of [
      "-dash",
      "a..b",
      "a~b",
      "a^b",
      "a:b",
      "a?b",
      "a*b",
      "a[b",
      "/leading",
      "x.lock",
    ]) {
      expect(() => assertRef(r)).toThrow(BadRequestError);
    }
  });
});

describe("assertDiagramPath", () => {
  it("returns the joined path for a diagram file", () => {
    expect(assertDiagramPath(["ops", "onboarding", "flow.txt"])).toBe("ops/onboarding/flow.txt");
    expect(assertDiagramPath(["ops", "flow.md"])).toBe("ops/flow.md");
  });

  it("serves only diagram sources — the app is not a general-purpose GitHub proxy", () => {
    expect(() => assertDiagramPath(["secrets.env"])).toThrow(/Only \.txt and \.md/);
    expect(() => assertDiagramPath(["Dockerfile"])).toThrow(/Only \.txt and \.md/);
  });

  // `.md` is now an extension the guard lets through, so the promise that this
  // app cannot serve arbitrary repository content rests on the reader: a
  // markdown file with no diagram fence in it reads as missing. See `repo.ts`.
  it("lets .md through for the reader to accept or reject on content", () => {
    expect(assertDiagramPath(["README.md"])).toBe("README.md");
  });

  it("rejects traversal", () => {
    expect(() => assertDiagramPath(["..", "..", "etc", "passwd.txt"])).toThrow(BadRequestError);
    expect(() => assertDiagramPath(["a", "", "b.txt"])).toThrow(BadRequestError);
    expect(() => assertDiagramPath(["a\\b.txt"])).toThrow(BadRequestError);
  });

  it("rejects an empty path and an over-long one", () => {
    expect(() => assertDiagramPath([])).toThrow(BadRequestError);
    expect(() => assertDiagramPath([`${"a".repeat(600)}.txt`])).toThrow(/too long/);
  });
});

describe("assertOwnerAllowed", () => {
  it("is open when no allowlist is configured", () => {
    delete process.env.HUB_ALLOWED_OWNERS;
    expect(() => assertOwnerAllowed("anyone")).not.toThrow();
  });

  it("enforces the allowlist case-insensitively when one is set", () => {
    process.env.HUB_ALLOWED_OWNERS = "Kuisin, acme";
    expect(() => assertOwnerAllowed("kuisin")).not.toThrow();
    expect(() => assertOwnerAllowed("ACME")).not.toThrow();
    expect(() => assertOwnerAllowed("someone-else")).toThrow(BadRequestError);
    delete process.env.HUB_ALLOWED_OWNERS;
  });
});
