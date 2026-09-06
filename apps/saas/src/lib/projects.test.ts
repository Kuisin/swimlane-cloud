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
  const edit = "kai/20260905-120000/abc123";

  it("never allows editing main, whoever asks", () => {
    expect(branchLockReason("main", "owner", none)).toBe("main");
  });

  it("reserves preview for owners", () => {
    expect(branchLockReason("preview", "owner", none)).toBeNull();
    expect(branchLockReason("preview", "editor", none)).toBe("previewOwnerOnly");
  });

  it("opens an edit branch to owners and editors, never viewers", () => {
    expect(branchLockReason(edit, "editor", none)).toBeNull();
    expect(branchLockReason(edit, "owner", none)).toBeNull();
    expect(branchLockReason(edit, "viewer", none)).toBe("viewer");
  });

  it("freezes an edit branch while it has an open pull request", () => {
    expect(branchLockReason(edit, "owner", new Set([edit]))).toBe("locked");
    expect(branchLockReason(edit, "owner", [edit])).toBe("locked");
  });

  it("still recognises a legacy tmp-* branch as editable", () => {
    expect(branchLockReason("tmp-u-e", "editor", none)).toBeNull();
    expect(branchLockReason("tmp-u-e", "viewer", none)).toBe("viewer");
  });

  it("refuses branches outside the model", () => {
    expect(branchLockReason("feature/x", "owner", none)).toBe("other");
  });
});

describe("assertBranchWritable", () => {
  it("throws 409 {locked:true} for a locked branch and 403 otherwise", () => {
    const edit = "kai/20260905-120000/abc123";
    const locked = (() => {
      try {
        assertBranchWritable(edit, "editor", [edit]);
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
