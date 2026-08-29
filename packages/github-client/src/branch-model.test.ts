import { describe, expect, it } from "vitest";
import {
  assertCheckpointTarget,
  assertMergeTarget,
  INTEGRATION_BRANCH,
  isTmpBranch,
  isWritableBranch,
  MergeTargetError,
  PROD_BRANCH,
  slugify,
  tmpBranchName,
} from "./branch-model.ts";

describe("slugify", () => {
  it("matches the SaaS implementation's shape", () => {
    expect(slugify("Onboarding Flow")).toBe("onboarding-flow");
    expect(slugify("  --Weird__Name!!  ")).toBe("weird-name");
    expect(slugify("a".repeat(80))).toHaveLength(60);
  });

  it("never returns an empty string, which would produce `tmp-user-`", () => {
    expect(slugify("!!!")).toBe("untitled");
    expect(slugify("")).toBe("untitled");
  });
});

describe("tmpBranchName", () => {
  it("produces tmp-<user>-<edit>", () => {
    expect(tmpBranchName("Kai Sawada", "Expense Approval")).toBe("tmp-kai-sawada-expense-approval");
  });

  it("round-trips through isTmpBranch", () => {
    expect(isTmpBranch(tmpBranchName("u", "e"))).toBe(true);
  });

  it("does not treat the bare prefix as a tmp branch", () => {
    expect(isTmpBranch("tmp-")).toBe(false);
  });
});

describe("isWritableBranch", () => {
  it("allows test and tmp-*, never main", () => {
    expect(isWritableBranch(INTEGRATION_BRANCH)).toBe(true);
    expect(isWritableBranch("tmp-u-e")).toBe(true);
    expect(isWritableBranch(PROD_BRANCH)).toBe(false);
    expect(isWritableBranch("feature/x")).toBe(false);
  });
});

describe("assertMergeTarget", () => {
  it("refuses tmp-* -> main, the mistake the model exists to prevent", () => {
    expect(() => assertMergeTarget("tmp-u-e", PROD_BRANCH)).toThrow(MergeTargetError);
    expect(() => assertMergeTarget("tmp-u-e", PROD_BRANCH)).toThrow(
      /cannot merge directly into main/,
    );
  });

  it("allows tmp-* -> test", () => {
    expect(() => assertMergeTarget("tmp-u-e", INTEGRATION_BRANCH)).not.toThrow();
  });

  it("refuses tmp-* into anything other than test", () => {
    expect(() => assertMergeTarget("tmp-u-e", "develop")).toThrow(/may only merge into test/);
  });

  it("allows the sanctioned promotion test -> main", () => {
    expect(() => assertMergeTarget(INTEGRATION_BRANCH, PROD_BRANCH)).not.toThrow();
  });

  it("refuses main as a merge source", () => {
    expect(() => assertMergeTarget(PROD_BRANCH, INTEGRATION_BRANCH)).toThrow(
      /never a merge source/,
    );
  });

  it("refuses a self-merge", () => {
    expect(() => assertMergeTarget("test", "test")).toThrow(/into itself/);
  });
});

describe("assertCheckpointTarget", () => {
  it("mirrors the SaaS guard at checkpoint/route.ts:32-34", () => {
    expect(() => assertCheckpointTarget(PROD_BRANCH)).toThrow(/not allowed directly on main/);
    expect(() => assertCheckpointTarget(INTEGRATION_BRANCH)).not.toThrow();
    expect(() => assertCheckpointTarget("tmp-u-e")).not.toThrow();
  });
});
