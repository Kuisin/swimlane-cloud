import { el, escapeText } from "./svg-utils.js";
import { renderStepShape } from "./step-shape.js";
import { renderBlockIcon } from "./block-icon.js";
import { truncate } from "../utils.js";

export const DOC_W = 65;
export const DOC_H = 40;
export const BOX_W = 120;
export const BOX_H = 44;

export function renderPropDocChipSvg(prop, x, y, theme) {
  const fill = prop.bg || theme.bg;
  const strokeCol = prop.borderColor || theme.stroke;
  const labelColor = prop.textColor || theme.title;
  const maxLen = typeof prop.maxChars === "number" && prop.maxChars > 0 ? prop.maxChars : 9;
  const tip = prop.title || prop.label || prop.id;

  return el("g", { transform: `translate(${x}, ${y})` }, [
    el("title", {}, escapeText(tip)),
    el("path", {
      d: `M 0 0 H ${DOC_W - 8} L ${DOC_W} 8 V ${DOC_H} H 0 Z`,
      fill,
      stroke: strokeCol,
      strokeWidth: "1.1",
    }),
    el("path", {
      d: `M ${DOC_W - 8} 0 V 8 H ${DOC_W}`,
      fill: "none",
      stroke: strokeCol,
      strokeWidth: "1",
    }),
    el(
      "text",
      {
        x: DOC_W / 2 - 2,
        y: 12,
        textAnchor: "middle",
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: "9",
        fill: labelColor,
      },
      escapeText(truncate(prop.label || prop.id, maxLen)),
    ),
  ]);
}

export function renderBlockPreviewSvg(block, theme) {
  const shape = block.shape || "rounded";
  const fill = block.bg || theme.boxBg;
  const stroke = block.borderColor || theme.stroke;
  const textColor = block.textColor || theme.boxText;
  const cx = BOX_W / 2 + 8;
  const cy = BOX_H / 2 + 8;
  const iconX = cx - BOX_W / 2;
  const iconY = cy;

  // A `viewBox` matching the drawing coordinates is what lets a caller resize
  // this SVG with CSS (`height: 28px`, say) and have the shape scale down with
  // it. Without one, the browser keeps painting at these absolute coordinates
  // regardless of the element's box, so a caller's shrink has no visible
  // effect on the drawing and it spills into whatever sits next to it.
  return el(
    "svg",
    {
      width: BOX_W + 16,
      height: BOX_H + 16,
      viewBox: `0 0 ${BOX_W + 16} ${BOX_H + 16}`,
    },
    [
      renderStepShape({ shape, cx, cy, w: BOX_W, h: BOX_H, fill, stroke }),
      renderBlockIcon({
        icon: block.icon,
        x: iconX,
        y: iconY,
        size: 14,
        color: textColor,
        shape,
      }),
    ],
  );
}

export function renderPropPreviewSvg(prop, theme) {
  // Same reasoning as `renderBlockPreviewSvg`: a `viewBox` is what makes a
  // CSS-driven resize actually scale the drawing instead of just the box.
  return el(
    "svg",
    {
      width: DOC_W + 8,
      height: DOC_H + 8,
      viewBox: `0 0 ${DOC_W + 8} ${DOC_H + 8}`,
    },
    renderPropDocChipSvg(prop, 4, 4, theme),
  );
}
