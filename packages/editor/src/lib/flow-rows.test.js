import { describe, expect, it } from "vitest";
import { moveRow, getFrameStepIndices, sameReorderFrame, rowBadgeLabel } from "./flow-rows.js";
import { EN, JA, tr } from "../i18n.jsx";

const steps = (...texts) =>
  texts.map((text) => ({ kind: "step", role: "r", text }));

describe("moveRow", () => {
  it("moves an item forward and reports its landing index", () => {
    const rows = steps("a", "b", "c", "d");
    const { rows: next, index } = moveRow(rows, 0, 3);
    expect(next.map((r) => r.text)).toEqual(["b", "c", "a", "d"]);
    expect(index).toBe(2);
    expect(next[index].text).toBe("a");
  });

  it("moves an item backward", () => {
    const rows = steps("a", "b", "c", "d");
    const { rows: next, index } = moveRow(rows, 3, 1);
    expect(next.map((r) => r.text)).toEqual(["a", "d", "b", "c"]);
    expect(index).toBe(1);
  });

  it("moves to the end via index past the last item", () => {
    const rows = steps("a", "b", "c");
    const { rows: next } = moveRow(rows, 0, 3);
    expect(next.map((r) => r.text)).toEqual(["b", "c", "a"]);
  });

  it("is a no-op when from === to", () => {
    const rows = steps("a", "b");
    expect(moveRow(rows, 1, 1).rows).toBe(rows);
  });
});

describe("branch-frame reorder constraints", () => {
  // a, if{ b }, c  — b is inside the branch, a/c are outside.
  const rows = [
    { kind: "step", role: "r", text: "a" },
    { kind: "branchStart", id: "x", cond: "?" },
    { kind: "step", role: "r", text: "b" },
    { kind: "branchEnd", id: "x" },
    { kind: "step", role: "r", text: "c" },
  ];

  it("groups steps by their enclosing branch frame", () => {
    expect(getFrameStepIndices(rows, 0)).toEqual([0, 4]); // top-level frame
    expect(getFrameStepIndices(rows, 2)).toEqual([2]); // inside the branch
  });

  it("only allows reordering within the same frame", () => {
    expect(sameReorderFrame(rows, 0, 4)).toBe(true);
    expect(sameReorderFrame(rows, 0, 2)).toBe(false); // across branch boundary
  });
});

describe("rowBadgeLabel localization", () => {
  const enT = (k, v) => tr(EN, k, v);
  const jaT = (k, v) => tr(JA, k, v);
  it("translates the badge per language", () => {
    const ifRow = { kind: "branchStart", parallel: false };
    expect(rowBadgeLabel(ifRow, enT)).toBe("if");
    expect(rowBadgeLabel(ifRow, jaT)).toBe("分岐");
    const step = { kind: "step", role: "r", text: "x" };
    expect(rowBadgeLabel(step, jaT)).toBe("ステップ");
  });
});
