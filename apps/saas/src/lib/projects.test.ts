import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { assertBranchWritable, branchLockReason, roleFromPermissions } from "./projects";

describe("roleFromPermissions", () => {
  it("maps GitHub repository permissions onto the three app roles", () => {
    expect(roleFromPermissions({ admin: true, push: true, pull: true })).toBe("owner");
    expect(roleFromPermissions({ admin: false, push: true, pull: true })).toBe("editor");
    expect(roleFromPermissions({ admin: false, push: false, pull: true })).toBe("viewer");
  });
});

describe("branchLockReason", () => {
  const none = new Set<string>();

  it("never allows editing main, whoever asks", () => {
    expect(branchLockReason("main", "owner", none)).toBe("main");
  });

  it("reserves test for owners", () => {
    expect(branchLockReason("test", "owner", none)).toBeNull();
    expect(branchLockReason("test", "editor", none)).toBe("testOwnerOnly");
  });

  it("opens tmp-* to owners and editors, never viewers", () => {
    expect(branchLockReason("tmp-u-e", "editor", none)).toBeNull();
    expect(branchLockReason("tmp-u-e", "owner", none)).toBeNull();
    expect(branchLockReason("tmp-u-e", "viewer", none)).toBe("viewer");
  });

  it("freezes a tmp-* branch while it has an open pull request", () => {
    expect(branchLockReason("tmp-u-e", "owner", new Set(["tmp-u-e"]))).toBe("locked");
    expect(branchLockReason("tmp-u-e", "owner", ["tmp-u-e"])).toBe("locked");
  });

  it("refuses branches outside the model", () => {
    expect(branchLockReason("feature/x", "owner", none)).toBe("other");
  });
});

describe("assertBranchWritable", () => {
  it("throws 409 {locked:true} for a locked branch and 403 otherwise", () => {
    const locked = (() => {
      try {
        assertBranchWritable("tmp-u-e", "editor", ["tmp-u-e"]);
      } catch (e) {
        return e as ApiError;
      }
    })()!;
    expect(locked.status).toBe(409);
    expect(locked.extra).toMatchObject({ locked: true, lockReason: "locked" });

    const main = (() => {
      try {
        assertBranchWritable("main", "owner", []);
      } catch (e) {
        return e as ApiError;
      }
    })()!;
    expect(main.status).toBe(403);
    expect(main.extra).toMatchObject({ lockReason: "main" });
  });
});
