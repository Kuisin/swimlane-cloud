/**
 * `parseGuiModel` forwards its options to `parseDSL` unchanged. This is what
 * lets a caller resolve `@use` imports for the GUI model exactly as it does
 * for the plain parse — without it, a diagram with imported definitions or
 * images resolves them in one view and not the other.
 */
import { describe, it, expect } from "vitest";
import { parseGuiModel } from "./gui-model.js";

const doc = (body) => `@kai-swimlane 2\n${body}\n@end\n`;

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
