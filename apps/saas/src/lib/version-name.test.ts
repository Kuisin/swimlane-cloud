import { describe, expect, it } from "vitest";
import { normalizeVersionName, nextVersionName } from "./version-name";

describe("normalizeVersionName", () => {
  it("accepts a bare semver and adds the v prefix", () => {
    expect(normalizeVersionName("1.2.0")).toBe("v1.2.0");
  });

  it("accepts an already-prefixed semver unchanged in shape", () => {
    expect(normalizeVersionName("v1.2.0")).toBe("v1.2.0");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeVersionName("  v2.0.0  ")).toBe("v2.0.0");
  });

  it("rejects anything that isn't exactly major.minor.patch", () => {
    expect(normalizeVersionName("1.2")).toBeNull();
    expect(normalizeVersionName("1.2.3.4")).toBeNull();
    expect(normalizeVersionName("abc")).toBeNull();
    expect(normalizeVersionName("")).toBeNull();
    expect(normalizeVersionName("v1.2.0-beta")).toBeNull();
  });
});

describe("nextVersionName", () => {
  it("starts at v1.0.0 when nothing exists yet", () => {
    expect(nextVersionName([])).toBe("v1.0.0");
  });

  it("bumps the minor version of the single existing version", () => {
    expect(nextVersionName(["v1.0.0"])).toBe("v1.1.0");
  });

  it("bumps from the highest version, not the last one in the list", () => {
    expect(nextVersionName(["v1.0.0", "v1.2.0", "v1.1.0"])).toBe("v1.3.0");
  });

  it("ignores names that are not semver", () => {
    expect(nextVersionName(["not-a-version", "v2.5.3", "release-1"])).toBe("v2.6.0");
  });

  it("compares numerically, not lexically, across double digits", () => {
    expect(nextVersionName(["v2.0.0", "v10.0.0"])).toBe("v10.1.0");
  });

  it("falls back to v1.0.0 when nothing parses", () => {
    expect(nextVersionName(["alpha", "release-1"])).toBe("v1.0.0");
  });
});
