import { el, join } from "./svg-utils.js";

export function renderStepShape({ shape, cx, cy, w, h, fill, stroke }) {
  const sw = 1.3;
  const common = { fill, stroke, strokeWidth: sw };

  if (shape === "rect") {
    return el("rect", { x: cx - w / 2, y: cy - h / 2, width: w, height: h, ...common });
  }
  if (shape === "ellipse") {
    return el("ellipse", { cx, cy, rx: w / 2, ry: h / 2, ...common });
  }
  if (shape === "hex") {
    const o = 14;
    const pts = [
      [cx - w / 2 + o, cy - h / 2],
      [cx + w / 2 - o, cy - h / 2],
      [cx + w / 2, cy],
      [cx + w / 2 - o, cy + h / 2],
      [cx - w / 2 + o, cy + h / 2],
      [cx - w / 2, cy],
    ];
    return el("polygon", {
      points: pts.map((p) => p.join(",")).join(" "),
      ...common,
    });
  }
  if (shape === "note") {
    const fold = 10;
    const x = cx - w / 2;
    const y2 = cy - h / 2;
    const d = `M ${x} ${y2} L ${x + w - fold} ${y2} L ${x + w} ${y2 + fold} L ${x + w} ${y2 + h} L ${x} ${y2 + h} Z`;
    return el("g", {}, [
      el("path", { d, ...common }),
      el("path", {
        d: `M ${x + w - fold} ${y2} L ${x + w - fold} ${y2 + fold} L ${x + w} ${y2 + fold}`,
        fill: "none",
        stroke,
        strokeWidth: sw,
      }),
    ]);
  }
  if (shape === "subroutine") {
    const x = cx - w / 2;
    const y2 = cy - h / 2;
    const inset = 10;
    return el("g", {}, [
      el("rect", { x, y: y2, width: w, height: h, rx: "4", ...common }),
      el("line", {
        x1: x + inset,
        y1: y2,
        x2: x + inset,
        y2: y2 + h,
        stroke,
        strokeWidth: sw,
      }),
      el("line", {
        x1: x + w - inset,
        y1: y2,
        x2: x + w - inset,
        y2: y2 + h,
        stroke,
        strokeWidth: sw,
      }),
    ]);
  }
  if (shape === "cloud") {
    const x = cx - w / 2;
    const y2 = cy - h / 2;
    const r = h / 2;
    const d = `
      M ${x + r} ${y2 + h}
      Q ${x} ${y2 + h} ${x} ${y2 + h / 2}
      Q ${x} ${y2} ${x + r} ${y2 + r * 0.4}
      Q ${x + w * 0.25} ${y2 - 4} ${x + w * 0.45} ${y2 + r * 0.3}
      Q ${x + w * 0.6} ${y2 - 6} ${x + w * 0.78} ${y2 + r * 0.4}
      Q ${x + w} ${y2} ${x + w} ${y2 + h / 2}
      Q ${x + w} ${y2 + h} ${x + w - r} ${y2 + h}
      Z
    `;
    return el("path", { d, ...common });
  }
  return el("rect", {
    x: cx - w / 2,
    y: cy - h / 2,
    width: w,
    height: h,
    rx: "6",
    ...common,
  });
}

/** Alias for JSX-factory compatibility during codegen. */
export const StepShape = renderStepShape;
