/** @typedef {'solid' | 'dashed' | 'dotted'} ArrowLineType */

export const ARROW_LINE_TYPES = ["solid", "dashed", "dotted"];

export function normalizeArrowLine(value) {
  const v = (value || "").trim().toLowerCase();
  return ARROW_LINE_TYPES.includes(v) ? /** @type {ArrowLineType} */ (v) : null;
}

/** SVG stroke props for connectors leaving a step (`arrow:` on that step). */
export function arrowLineStrokeProps(lineType) {
  switch (normalizeArrowLine(lineType) || "solid") {
    case "dashed":
      return { strokeDasharray: "6 3" };
    case "dotted":
      return { strokeDasharray: "2 3" };
    default:
      return {};
  }
}

export function stepOutgoingArrowLine(row) {
  return normalizeArrowLine(row?.arrowLine) || "solid";
}
