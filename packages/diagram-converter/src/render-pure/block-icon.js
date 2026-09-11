import { el, join, escapeText } from "./svg-utils.js";
import { getLucideIconNode } from "./icon-paths.js";

const EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

function isEmoji(str) {
  return EMOJI_RE.test(str);
}

function renderLucideIcon(name, x, y, size, color) {
  const node = getLucideIconNode(name);
  if (!node) return "";
  const inner = node
    .map(([tag, attrs]) => {
      const { key: _key, ...rest } = attrs;
      return el(tag, rest);
    })
    .join("");
  return el(
    "svg",
    {
      x: x - size / 2,
      y: y - size / 2,
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth: 2,
    },
    inner,
  );
}

/**
 * An imported image, drawn as `<image>` with its `data:` URI.
 *
 * Deliberately not inlined as SVG markup: an `<image>` is a replaced element,
 * so a script, an event handler or an external reference inside an imported
 * drawing never executes in the page showing the diagram. The aspect ratio is
 * preserved and the image is centred in the square an icon occupies.
 */
function renderAssetIcon(dataUri, x, y, size) {
  return el("image", {
    href: dataUri,
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size,
    preserveAspectRatio: "xMidYMid meet",
  });
}

export function renderBlockIcon({ icon, iconAsset, x, y, size, color, shape }) {
  if (!icon && !iconAsset) return "";

  let iconX;
  let iconY;
  switch (shape) {
    case "rect":
    case "ellipse":
    case "note":
      iconX = x + 16;
      iconY = y;
      break;
    case "hex":
      iconX = x + 22;
      iconY = y;
      break;
    case "subroutine":
      iconX = x + 26;
      iconY = y;
      break;
    case "cloud":
      iconX = x + 22;
      iconY = y + 3;
      break;
    default:
      iconX = x + 16;
      iconY = y;
      break;
  }

  if (iconAsset?.dataUri) return renderAssetIcon(iconAsset.dataUri, iconX, iconY, size);
  // An image reference whose import did not resolve draws nothing; the `@id`
  // spelling is a reference, never a glyph to fall back on.
  if (!icon || icon.startsWith("@")) return "";

  if (icon.startsWith("#")) {
    const name = icon.slice(1);
    const lucide = renderLucideIcon(name, iconX, iconY, size, color);
    if (lucide) return lucide;
  }

  const display = icon.startsWith("#") ? icon.slice(1) : icon;
  const fontSize = isEmoji(display) ? size : size * 0.85;

  return el(
    "text",
    {
      x: iconX,
      y: iconY,
      textAnchor: "middle",
      dominantBaseline: "central",
      fontSize,
      fill: color,
      fontFamily: "'Noto Sans JP','Noto Sans',sans-serif",
    },
    escapeText(display),
  );
}

/** Alias for JSX-factory compatibility during codegen. */
export const BlockIcon = renderBlockIcon;
