import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { assertPlanAllowsRepoCreation, planAllowsRepoCreation } from "./plans";

describe("planAllowsRepoCreation", () => {
  it("only free is excluded — repo creation is a paid-plan action", () => {
    expect(planAllowsRepoCreation("free")).toBe(false);
    expect(planAllowsRepoCreation("team")).toBe(true);
    expect(planAllowsRepoCreation("enterprise")).toBe(true);
  });
});

describe("assertPlanAllowsRepoCreation", () => {
  it("throws 402 {upgrade:true} for a free-plan workspace", () => {
    const err = (() => {
      try {
        assertPlanAllowsRepoCreation("free");
      } catch (e) {
        return e as ApiError;
      }
    })()!;
    expect(err.status).toBe(402);
    expect(err.extra).toMatchObject({ upgrade: true, plan: "free" });
  });

  it("is a no-op for team and enterprise", () => {
    expect(() => assertPlanAllowsRepoCreation("team")).not.toThrow();
    expect(() => assertPlanAllowsRepoCreation("enterprise")).not.toThrow();
  });
});
