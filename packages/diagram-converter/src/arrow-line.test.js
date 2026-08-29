import { describe, it, expect } from "vitest";
import {
  ARROW_LINE_TYPES,
  normalizeArrowLine,
  arrowLineDasharray,
  arrowLineStrokeProps,
} from "./arrow-line.js";

describe("arrow line types", () => {
  it("exposes the full set of stroke types", () => {
    expect(ARROW_LINE_TYPES).toEqual(["solid", "dashed", "dotted", "long-dash", "dash-dot"]);
  });

  it("normalizes case/whitespace and rejects unknown values", () => {
    expect(normalizeArrowLine(" Dashed ")).toBe("dashed");
    expect(normalizeArrowLine("LONG-DASH")).toBe("long-dash");
    expect(normalizeArrowLine("none")).toBeNull();
    expect(normalizeArrowLine("")).toBeNull();
  });

  it("maps each type to a distinct dasharray (solid omits it)", () => {
    expect(arrowLineDasharray("solid")).toBeNull();
    expect(arrowLineDasharray("dashed")).toBe("6 3");
    expect(arrowLineDasharray("dotted")).toBe("2 3");
    expect(arrowLineDasharray("long-dash")).toBe("12 5");
    expect(arrowLineDasharray("dash-dot")).toBe("8 3 2 3");
    // unknown / falsy falls back to solid
    expect(arrowLineDasharray("bogus")).toBeNull();
  });

  it("stroke props only carry strokeDasharray for non-solid types", () => {
    expect(arrowLineStrokeProps("solid")).toEqual({});
    expect(arrowLineStrokeProps("dash-dot")).toEqual({ strokeDasharray: "8 3 2 3" });
  });
});
