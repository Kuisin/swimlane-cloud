/** @typedef {'solid' | 'dashed' | 'dotted' | 'long-dash' | 'dash-dot'} ArrowLineType */

export const ARROW_LINE_TYPES = ["solid", "dashed", "dotted", "long-dash", "dash-dot"];

/** `stroke-dasharray` pattern per line type (`solid` omits the attribute). */
const ARROW_LINE_DASHARRAY = {
  dashed: "6 3",
  dotted: "2 3",
  "long-dash": "12 5",
  "dash-dot": "8 3 2 3",
};

export function normalizeArrowLine(value) {
  const v = (value || "").trim().toLowerCase();
  return ARROW_LINE_TYPES.includes(v) ? /** @type {ArrowLineType} */ (v) : null;
}

/** The raw `stroke-dasharray` string for a line type, or `null` for solid. */
export function arrowLineDasharray(lineType) {
  return ARROW_LINE_DASHARRAY[normalizeArrowLine(lineType) || "solid"] ?? null;
}

/** SVG stroke props for connectors leaving a step (`arrow:` on that step). */
export function arrowLineStrokeProps(lineType) {
  const dash = arrowLineDasharray(lineType);
  return dash ? { strokeDasharray: dash } : {};
}

export function stepOutgoingArrowLine(row) {
  return normalizeArrowLine(row?.arrowLine) || "solid";
}
