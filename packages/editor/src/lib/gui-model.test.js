/**
 * `parseGuiModel` forwards its options to `parseDSL` unchanged. This is what
 * lets a caller resolve `@use` imports for the GUI model exactly as it does
 * for the plain parse — without it, a diagram with imported definitions or
 * images resolves them in one view and not the other.
 */
import { describe, it, expect } from "vitest";
import { applyModelEdit, parseGuiModel } from "./gui-model.js";
import { makeStepId, pruneUnreferencedStepIds } from "./flow-rows.js";

const doc = (body) => `@kai-swimlane\n${body}\n@end\n`;

describe("parseGuiModel", () => {
  it("resolves a fragment import when given a resolver", () => {
    const fragment = "/role/\n<a>\n  label: Imported;\n";
    const gui = parseGuiModel(doc("@use shared.txt;\n\n/line/\n[a: x]"), {
      resolveImport: () => fragment,
    });
    expect(gui.errors).toEqual([]);
    expect(gui.lanes[0]).toMatchObject({ id: "a", label: "Imported" });
  });

  it("resolves an image import when given a resolver", () => {
    const PNG = "data:image/png;base64,AAAA";
    const gui = parseGuiModel(
      doc("@use logo.png;\n\n/role/\n<a>\n  icon: @logo;\n\n/line/\n[a: x]"),
      { resolveAsset: () => PNG },
    );
    expect(gui.errors).toEqual([]);
    expect(gui.lanes[0].iconAsset).toMatchObject({ dataUri: PNG });
  });

  it("without a resolver, reports the import as unresolved rather than throwing", () => {
    const gui = parseGuiModel(doc("@use missing.txt;\n\n/line/\n[a: x]"));
    expect(gui.errors.map((e) => e.msg)).toEqual([
      'cannot resolve "missing.txt" — definitions fall back to theme defaults',
    ]);
  });
});

/**
 * The GUI's definitions editor writes `lanes` / `blocks` / `props`; the
 * serializer reads `roles` + `localDefIds`. `applyModelEdit` keeps them in
 * step, or a role added in the GUI would never reach the saved file.
 */
describe("applyModelEdit definition sync", () => {
  const SRC = doc("/role/\n<a>\nlabel: A;\n\n/block/\n<b1>\nshape: rect;\n\n/line/\n[a: x] <b1>");

  it("writes a lane the GUI added as a local role", () => {
    const out = applyModelEdit(SRC, (draft) => {
      draft.lanes = [...draft.lanes, { id: "auditor", label: "Auditor" }];
    });
    expect(out).toContain("<auditor>");
    expect(out).toContain("label: Auditor;");
    const m = parseGuiModel(out);
    expect(m.errors).toEqual([]);
    expect(m.lanes.map((l) => l.id)).toEqual(["a", "auditor"]);
  });

  it("drops a lane the GUI removed", () => {
    const out = applyModelEdit(SRC, (draft) => {
      draft.lanes = draft.lanes.filter((l) => l.id !== "a");
    });
    expect(out).not.toContain("<a>");
  });

  it("writes a block and a prop that did not exist before the edit", () => {
    const out = applyModelEdit(SRC, (draft) => {
      draft.blocks = { ...draft.blocks, b2: { id: "b2", shape: "rounded" } };
      draft.props = { ...draft.props, p1: { id: "p1", label: "P", side: "left" } };
    });
    expect(out).toContain("<b2>");
    expect(out).toContain("shape: rounded;");
    expect(out).toContain("<p1>");
    expect(out).toContain("side: left;");
  });

  it("leaves a fragment-supplied role alone", () => {
    const fragment = "/role/\n<shared>\n  label: Shared;\n";
    const src = doc("@use shared.txt;\n\n/role/\n<a>\nlabel: A;\n\n/line/\n[shared: x]");
    const out = applyModelEdit(
      src,
      (draft) => {
        draft.lanes = [...draft.lanes, { id: "b", label: "B" }];
      },
      { resolveImport: () => fragment },
    );
    expect(out).toContain("@use shared.txt;");
    expect(out).not.toContain("<shared>");
    expect(out).toContain("<b>");
  });
});

/**
 * A step's jump-target name is still the `mergeId` model field — only its
 * spelling in the document moved, from an `@id` suffix to an `id: …;`
 * follow-up line. So the shared serializer does all the work, and nothing in
 * the GUI needs to know the difference; this pins that empirically rather
 * than by inspection, because "the GUI still writes `@id`" would be a silent
 * corruption (the suffix no longer parses at all).
 */
describe("a step's id through the GUI edit path", () => {
  const SRC = doc("/role/\n<a>\nlabel: A;\n\n/line/\n[a: Send the invoice]");

  it("writes mergeId as an `id: …;` line, never as an `@id` suffix", () => {
    const out = applyModelEdit(SRC, (draft) => {
      const i = draft.rows.findIndex((r) => r.kind === "step");
      draft.rows[i] = { ...draft.rows[i], mergeId: "step-1" };
    });
    expect(out).toContain("  id: step-1;");
    expect(out).not.toContain("@step-1");
    // …and it reparses as the same field, so the model round-trips.
    const m = parseGuiModel(out);
    expect(m.errors).toEqual([]);
    expect(m.rows.find((r) => r.kind === "step").mergeId).toBe("step-1");
  });

  it("clearing the id drops the line rather than leaving an empty one", () => {
    const named = applyModelEdit(SRC, (draft) => {
      const i = draft.rows.findIndex((r) => r.kind === "step");
      draft.rows[i] = { ...draft.rows[i], mergeId: "step-1" };
    });
    const out = applyModelEdit(named, (draft) => {
      const i = draft.rows.findIndex((r) => r.kind === "step");
      draft.rows[i] = { ...draft.rows[i], mergeId: "" };
    });
    expect(out).not.toContain("id:");
    expect(parseGuiModel(out).errors).toEqual([]);
  });

  it("a `[goto: id]` pointed at it round-trips through the same path", () => {
    const src = doc(
      "/role/\n<a>\nlabel: A;\n\n/line/\nif (q?) is (yes) than\n  [a: one]\n  [goto: done]\nelse-if () than\n  [a: two]\nend-if\n[a: finish]\n  id: done;",
    );
    const out = applyModelEdit(src, (draft) => {
      const i = draft.rows.findIndex((r) => r.kind === "step" && r.text === "one");
      draft.rows[i] = { ...draft.rows[i], text: "first" };
    });
    expect(out).toContain("[goto: done]");
    expect(out).toContain("id: done;");
    const m = parseGuiModel(out);
    expect(m.errors).toEqual([]);
    expect(m.rows.find((r) => r.kind === "branchMerge").mergeTarget).toBe("done");
  });
});

/**
 * The GUI never asks anyone to invent an id, and never shows the one it
 * invents: a jump's destination picker names steps, and the `id:` line exists
 * only for as long as some jump needs it. These exercise the two halves of
 * gui-mode's `pickMergeTarget` / `deleteRow` against real DSL text, since the
 * whole point is what ends up in the *saved document*.
 */
describe("ids are assigned and reclaimed around a jump, never typed", () => {
  const SRC = doc(
    "/role/\n<a>\nlabel: A;\n\n/line/\nif (q?) is (yes) than\n  [a: one]\n  [goto: step-1]\nelse-if () than\n  [a: two]\nend-if\n[a: finish]\n  id: step-1;\n[a: after]",
  );

  /** What gui-mode's `pickMergeTarget` does, minus the React plumbing. */
  const retarget = (src, text) =>
    applyModelEdit(src, (draft) => {
      const at = draft.rows.findIndex((r) => r.kind === "step" && r.text === text);
      const jumpAt = draft.rows.findIndex((r) => r.kind === "branchMerge");
      draft.rows[jumpAt] = { ...draft.rows[jumpAt], mergeTarget: "" };
      draft.rows = pruneUnreferencedStepIds(draft.rows);
      const id = (draft.rows[at].mergeId || "").trim() || makeStepId(draft.rows);
      draft.rows[at] = { ...draft.rows[at], mergeId: id };
      draft.rows[jumpAt] = { ...draft.rows[jumpAt], mergeTarget: id };
    });

  it("picking a step with no id gives it one, in the saved DSL", () => {
    const out = retarget(SRC, "after");
    expect(parseGuiModel(out).errors).toEqual([]);
    const after = parseGuiModel(out).rows.find((r) => r.kind === "step" && r.text === "after");
    // Reuses `step-1`, freed from the previous target in the same edit, so
    // repeated retargeting doesn't ratchet the counter up forever.
    expect(after.mergeId).toBe("step-1");
    expect(out).toContain("[goto: step-1]");
  });

  it("retargeting away from a step takes its id back with it", () => {
    const out = retarget(SRC, "after");
    const finish = parseGuiModel(out).rows.find((r) => r.kind === "step" && r.text === "finish");
    // "finish" held step-1 before; nothing references it now, so the line is
    // gone rather than orphaned in the document.
    expect(finish.mergeId).toBeFalsy();
    expect(out.match(/id: /g)).toHaveLength(1);
  });

  it("leaves an id alone while something still references it", () => {
    // Two jumps at the same step: retargeting one must not strip the id the
    // other is still using.
    const src = doc(
      "/role/\n<a>\nlabel: A;\n\n/line/\nif (q?) is (yes) than\n  [a: one]\n  [goto: prog_end]\nelse-if () than\n  [a: two]\n  loop @prog_end\nend-if\n[a: finish]\n  id: prog_end;\n[a: after]",
    );
    const out = retarget(src, "after");
    const finish = parseGuiModel(out).rows.find((r) => r.kind === "step" && r.text === "finish");
    expect(finish.mergeId).toBe("prog_end");
    expect(out).toContain("loop @prog_end");
  });

  it("deleting the jump reclaims the id it was the last user of", () => {
    const out = applyModelEdit(SRC, (draft) => {
      const jumpAt = draft.rows.findIndex((r) => r.kind === "branchMerge");
      draft.rows.splice(jumpAt, 1);
      draft.rows = pruneUnreferencedStepIds(draft.rows);
    });
    expect(out).not.toContain("id:");
    expect(out).not.toContain("goto");
    expect(parseGuiModel(out).errors).toEqual([]);
  });
});

/**
 * The `if` keyword migration (`if (q) is (a) than` / `else-if (b) than`, and a
 * fork's later paths as `case (c)`) changed only what the parser reads and the
 * serializer writes — `branchStart`/`branchCase` and their `cond`,
 * `firstCase`, `label`, `parallel` fields are untouched, so the GUI's
 * row-editing code needs no change at all.
 *
 * That is a claim about behaviour, not about a diff, so it is checked the only
 * way that stays true later: drive the same model edits the GUI makes (the
 * branch inspector patches a field, the Add menu splices a row) and read the
 * text that comes back out.
 */
describe("GUI edits write today's branch grammar, with no keyword of their own", () => {
  const IF_SRC = doc(
    "/role/\n<a>\nlabel: A;\n\n/line/\nif (q?) is (yes) than\n  [a: one]\nelse-if (no) than\n  [a: two]\nend-if",
  );
  const FORK_SRC = doc(
    "/role/\n<a>\nlabel: A;\n\n/line/\nfork (Shipping)\n  [a: ship]\ncase (Billing)\n  [a: bill]\nend-fork",
  );

  /** What `BranchInspector`'s `onPatch` does: merge fields into one row. */
  const patch = (src, find, fields) =>
    applyModelEdit(src, (draft) => {
      const i = draft.rows.findIndex(find);
      expect(i).toBeGreaterThanOrEqual(0);
      draft.rows[i] = { ...draft.rows[i], ...fields };
    });

  it("retypes an if's condition without disturbing the fused first clause", () => {
    const out = patch(IF_SRC, (r) => r.kind === "branchStart", { cond: "approved?" });
    expect(out).toContain("if (approved?) is (yes) than");
    expect(out).toContain("else-if (no) than");
    expect(parseGuiModel(out).errors).toEqual([]);
  });

  it("relabels the first clause back onto the if line, not onto an else-if", () => {
    // After `normalizeBranchRows` the first clause is a `branchCase` row like
    // any other, which is exactly why the inspector needs no special case.
    const out = patch(IF_SRC, (r) => r.kind === "branchCase" && r.label === "yes", {
      label: "approved",
    });
    expect(out).toContain("if (q?) is (approved) than");
    expect(out).not.toMatch(/else-if \(approved\)/);
    expect(parseGuiModel(out).errors).toEqual([]);
  });

  it("relabels a later clause as an else-if", () => {
    const out = patch(IF_SRC, (r) => r.kind === "branchCase" && r.label === "no", {
      label: "rejected",
    });
    expect(out).toContain("else-if (rejected) than");
    expect(parseGuiModel(out).errors).toEqual([]);
  });

  it("blanking a later clause's label writes the catch-all, never a bare else", () => {
    const out = patch(IF_SRC, (r) => r.kind === "branchCase" && r.label === "no", { label: "" });
    expect(out).toContain("else-if () than");
    expect(out).not.toMatch(/^\s*else\s*$/m);
    expect(parseGuiModel(out).errors).toEqual([]);
  });

  it("adds a clause the way the inspector's Add case button does", () => {
    // gui-mode's `addCaseToBranch`: splice a branchCase in before branchEnd.
    const out = applyModelEdit(IF_SRC, (draft) => {
      const endIdx = draft.rows.findIndex((r) => r.kind === "branchEnd");
      const branchId = draft.rows[endIdx].id;
      draft.rows.splice(endIdx, 0, {
        kind: "branchCase",
        id: branchId,
        label: "New case",
        parallel: false,
        branchColor: null,
        depth: 0,
      });
    });
    expect(out).toContain("else-if (New case) than");
    expect(parseGuiModel(out).errors).toEqual([]);
  });

  it("adds a fork path as `case (…)`, never as `and (…)`", () => {
    const out = applyModelEdit(FORK_SRC, (draft) => {
      const endIdx = draft.rows.findIndex((r) => r.kind === "branchEnd");
      const branchId = draft.rows[endIdx].id;
      draft.rows.splice(endIdx, 0, {
        kind: "branchCase",
        id: branchId,
        label: "Audit",
        parallel: true,
        branchColor: null,
        depth: 0,
      });
    });
    expect(out).toContain("case (Audit)");
    expect(out).not.toMatch(/^\s*and\b/m);
    expect(parseGuiModel(out).errors).toEqual([]);
  });

  it("colours the catch-all clause and keeps the colour on the else-if line", () => {
    const out = patch(IF_SRC, (r) => r.kind === "branchCase" && r.label === "no", {
      label: "",
      branchColor: "red",
    });
    expect(out).toContain("else-if () than #red");
    expect(parseGuiModel(out).errors).toEqual([]);
  });

  it("writes a whole new if the way gui-mode's Add menu builds one", () => {
    const out = applyModelEdit(doc("/role/\n<a>\nlabel: A;\n\n/line/\n[a: start]"), (draft) => {
      draft.rows.push(
        {
          kind: "branchStart",
          id: "b1",
          cond: "Condition",
          firstCase: "Case A",
          parallel: false,
          branchColor: null,
          depth: 0,
        },
        { kind: "branchCase", id: "b1", label: "Case B", parallel: false, depth: 0 },
        { kind: "branchCase", id: "b1", label: "", parallel: false, depth: 0 },
        { kind: "branchEnd", id: "b1", parallel: false, depth: 0 },
      );
    });
    expect(out).toContain("if (Condition) is (Case A) than");
    expect(out).toContain("else-if (Case B) than");
    expect(out).toContain("else-if () than");
    expect(out).toContain("end-if");
    expect(parseGuiModel(out).errors).toEqual([]);
  });
});
