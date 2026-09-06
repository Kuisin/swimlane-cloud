import { describe, expect, it } from "vitest";
import {
  assertCheckpointTarget,
  assertMergeTarget,
  EDIT_BRANCH_RE,
  editBranchName,
  editBranchOwner,
  formatEditTimestamp,
  INTEGRATION_BRANCH,
  isEditBranch,
  isTmpBranch,
  isWritableBranch,
  MergeTargetError,
  PROD_BRANCH,
  randomEditKey,
  slugify,
} from "./branch-model.ts";

describe("slugify", () => {
  it("matches the SaaS implementation's shape", () => {
    expect(slugify("Onboarding Flow")).toBe("onboarding-flow");
    expect(slugify("  --Weird__Name!!  ")).toBe("weird-name");
    expect(slugify("a".repeat(80))).toHaveLength(60);
  });

  it("never returns an empty string, which would produce an empty branch segment", () => {
    expect(slugify("!!!")).toBe("untitled");
    expect(slugify("")).toBe("untitled");
  });
});

describe("formatEditTimestamp", () => {
  it("zero-pads every field and is UTC, not local time", () => {
    expect(formatEditTimestamp(new Date("2026-01-02T03:04:05Z"))).toBe("20260102-030405");
  });
});

describe("randomEditKey", () => {
  it("produces a lowercase alphanumeric string of the requested length", () => {
    const key = randomEditKey(6);
    expect(key).toHaveLength(6);
    expect(key).toMatch(/^[a-z0-9]{6}$/);
  });

  it("is not constant across calls", () => {
    const keys = new Set(Array.from({ length: 20 }, () => randomEditKey()));
    expect(keys.size).toBeGreaterThan(1);
  });
});

describe("editBranchName", () => {
  it("produces <login>/<timestamp>/<key>", () => {
    expect(editBranchName("Kai Sawada", new Date("2026-09-05T12:00:00Z"), "abc123")).toBe(
      "kai-sawada/20260905-120000/abc123",
    );
  });

  it("round-trips through isEditBranch and EDIT_BRANCH_RE", () => {
    const branch = editBranchName("kai", new Date("2026-09-05T12:00:00Z"), "abc123");
    expect(isEditBranch(branch)).toBe(true);
    expect(EDIT_BRANCH_RE.test(branch)).toBe(true);
  });
});

describe("isEditBranch", () => {
  it("accepts the current shape", () => {
    expect(isEditBranch("kai/20260905-120000/abc123")).toBe(true);
  });

  it("rejects malformed timestamps, empty segments, uppercase and short keys", () => {
    expect(isEditBranch("kai/2026-09-05/abc123")).toBe(false);
    expect(isEditBranch("kai//abc123")).toBe(false);
    expect(isEditBranch("Kai/20260905-120000/abc123")).toBe(false);
    expect(isEditBranch("kai/20260905-120000/abc12")).toBe(false);
  });

  it("still recognises legacy tmp-* branches", () => {
    expect(isEditBranch("tmp-kai-onboarding")).toBe(true);
    expect(isTmpBranch("tmp-kai-onboarding")).toBe(true);
  });

  it("does not treat the bare tmp- prefix as an edit branch", () => {
    expect(isEditBranch("tmp-")).toBe(false);
  });
});

describe("editBranchOwner", () => {
  it("returns the login segment for the current shape", () => {
    expect(editBranchOwner("kai/20260905-120000/abc123")).toBe("kai");
  });

  it("returns null for a legacy tmp-* branch, which cannot be split reliably", () => {
    expect(editBranchOwner("tmp-kai-onboarding")).toBeNull();
  });
});

describe("isWritableBranch", () => {
  it("allows preview and edit branches, never main", () => {
    expect(isWritableBranch(INTEGRATION_BRANCH)).toBe(true);
    expect(isWritableBranch("kai/20260905-120000/abc123")).toBe(true);
    expect(isWritableBranch("tmp-u-e")).toBe(true);
    expect(isWritableBranch(PROD_BRANCH)).toBe(false);
    expect(isWritableBranch("feature/x")).toBe(false);
  });
});

describe("assertMergeTarget", () => {
  const edit = "kai/20260905-120000/abc123";

  it("refuses an edit branch -> main, the mistake the model exists to prevent", () => {
    expect(() => assertMergeTarget(edit, PROD_BRANCH)).toThrow(MergeTargetError);
    expect(() => assertMergeTarget(edit, PROD_BRANCH)).toThrow(/cannot merge directly into main/);
  });

  it("allows an edit branch -> preview", () => {
    expect(() => assertMergeTarget(edit, INTEGRATION_BRANCH)).not.toThrow();
  });

  it("refuses an edit branch into anything other than preview", () => {
    expect(() => assertMergeTarget(edit, "develop")).toThrow(/may only merge into preview/);
  });

  it("allows the sanctioned promotion preview -> main", () => {
    expect(() => assertMergeTarget(INTEGRATION_BRANCH, PROD_BRANCH)).not.toThrow();
  });

  it("refuses main as a merge source", () => {
    expect(() => assertMergeTarget(PROD_BRANCH, INTEGRATION_BRANCH)).toThrow(
      /never a merge source/,
    );
  });

  it("refuses a self-merge", () => {
    expect(() => assertMergeTarget("preview", "preview")).toThrow(/into itself/);
  });

  it("still refuses a legacy tmp-* branch -> main", () => {
    expect(() => assertMergeTarget("tmp-u-e", PROD_BRANCH)).toThrow(MergeTargetError);
  });
});

describe("assertCheckpointTarget", () => {
  it("mirrors the SaaS guard at checkpoint/route.ts:32-34", () => {
    expect(() => assertCheckpointTarget(PROD_BRANCH)).toThrow(/not allowed directly on main/);
    expect(() => assertCheckpointTarget(INTEGRATION_BRANCH)).not.toThrow();
    expect(() => assertCheckpointTarget("kai/20260905-120000/abc123")).not.toThrow();
  });
});
