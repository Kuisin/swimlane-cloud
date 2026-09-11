/**
 * `parseGuiModel` forwards its options to `parseDSL` unchanged. This is what
 * lets a caller resolve `@use` imports for the GUI model exactly as it does
 * for the plain parse — without it, a diagram with imported definitions or
 * images resolves them in one view and not the other.
 */
import { describe, it, expect } from "vitest";
import { applyModelEdit, parseGuiModel } from "./gui-model.js";

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
