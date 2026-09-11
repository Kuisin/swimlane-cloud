import { describe, expect, it } from "vitest";
import {
  moveRow,
  getFrameStepIndices,
  sameReorderFrame,
  rowBadgeLabel,
  collectMergeTargetOptions,
  makeStepId,
  pruneUnreferencedStepIds,
} from "./flow-rows.js";
import { EN, JA, tr } from "../i18n.jsx";

const steps = (...texts) => texts.map((text) => ({ kind: "step", role: "r", text }));

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

  // The keyword an if's clause is actually spelled with depends on whether it
  // is the one fused onto the `if` line (`is (…) than`) or a later
  // `else-if (…) than`; a fork's non-first path is `case (…)`.
  it("names an if clause by the keyword the document really uses", () => {
    const rows = [
      { kind: "branchStart", id: "x", cond: "q?" },
      { kind: "branchCase", id: "x", label: "yes" },
      { kind: "branchCase", id: "x", label: "no" },
      { kind: "branchCase", id: "x", label: "" },
      { kind: "branchEnd", id: "x" },
    ];
    expect(rowBadgeLabel(rows[1], enT, rows, 1)).toBe("is");
    expect(rowBadgeLabel(rows[2], enT, rows, 2)).toBe("else-if");
    expect(rowBadgeLabel(rows[3], enT, rows, 3)).toBe("otherwise");
    // No keyword the grammar dropped survives anywhere in the badges.
    const fork = [
      { kind: "branchStart", id: "f", parallel: true },
      { kind: "branchCase", id: "f", parallel: true, label: "Billing" },
    ];
    expect(rowBadgeLabel(fork[1], enT, fork, 1)).toBe("case");
  });
});

describe("collectMergeTargetOptions", () => {
  it("lists every step by its own label, reporting its id without showing it", () => {
    const rows = [
      { kind: "step", role: "r", text: "start" },
      { kind: "step", role: "r", text: "done step", mergeId: "step-1" },
      { kind: "step", role: "", text: "no role" }, // excluded: no role
      { kind: "branchStart", id: "x", cond: "?" }, // excluded: not a step
    ];
    const options = collectMergeTargetOptions(rows);
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({
      kind: "step",
      stepIndex: 0,
      mergeId: "",
      blockName: "start",
      label: "start",
    });
    // The id is on the option for the caller to use, but the label the user
    // reads is the step, not `step-1` — ids are never shown in the GUI.
    expect(options[1]).toMatchObject({ stepIndex: 1, mergeId: "step-1", label: "done step" });
    expect(options.every((o) => !o.label.includes("step-1"))).toBe(true);
  });

  // Every jump names a real step now, so a step is the *only* kind of
  // candidate — there is no landing-marker row left to list beside them.
  it("lists nothing but steps", () => {
    const rows = [
      { kind: "step", role: "r", text: "start" },
      { kind: "branchStart", id: "x", cond: "?" },
      { kind: "branchMerge", mergeTarget: "done" },
      { kind: "branchEnd", id: "x" },
      { kind: "branchLoop" },
      { kind: "groupStart", id: "g", groupMode: "section" },
    ];
    const options = collectMergeTargetOptions(rows);
    expect(options).toHaveLength(1);
    expect(options.every((o) => o.kind === "step")).toBe(true);
  });
});

/**
 * Ids are plumbing: the GUI has no field for typing one, assigns them only
 * when a jump is pointed at a step, and takes them away again when the last
 * jump stops pointing there. So they are sequential tokens, not slugs of a
 * label the author might later reword.
 */
describe("makeStepId", () => {
  it("hands out step-1, step-2, … rather than a slug of the step's text", () => {
    const rows = [{ kind: "step", role: "r", text: "Send the invoice", name: "Send invoice" }];
    expect(makeStepId(rows)).toBe("step-1");
  });

  it("skips ids already in use, including ones written by hand in Text mode", () => {
    const rows = [
      { kind: "step", role: "r", text: "a", mergeId: "step-1" },
      { kind: "step", role: "r", text: "b", mergeId: "prog_end" },
      { kind: "step", role: "r", text: "c", mergeId: "step-2" },
      { kind: "step", role: "r", text: "d" },
    ];
    expect(makeStepId(rows)).toBe("step-3");
  });
});

describe("pruneUnreferencedStepIds", () => {
  const goto = (target) => ({ kind: "branchMerge", mergeTarget: target });

  it("clears an id no jump points at any more", () => {
    const rows = [
      { kind: "step", role: "r", text: "a", mergeId: "step-1" },
      { kind: "step", role: "r", text: "b", mergeId: "step-2" },
      goto("step-2"),
    ];
    const out = pruneUnreferencedStepIds(rows);
    expect(out[0].mergeId).toBe("");
    expect(out[1].mergeId).toBe("step-2");
  });

  it("keeps an id a `loop @id` still references", () => {
    const rows = [
      { kind: "step", role: "r", text: "a", mergeId: "step-1" },
      { kind: "branchLoop", loopTarget: "step-1" },
    ];
    expect(pruneUnreferencedStepIds(rows)[0].mergeId).toBe("step-1");
  });

  it("returns the same array when nothing needs clearing", () => {
    const rows = [{ kind: "step", role: "r", text: "a", mergeId: "step-1" }, goto("step-1")];
    expect(pruneUnreferencedStepIds(rows)).toBe(rows);
  });

  it("leaves non-step rows alone", () => {
    const rows = [{ kind: "branchStart", id: "x", cond: "?" }, goto("gone")];
    expect(pruneUnreferencedStepIds(rows)).toBe(rows);
  });
});
