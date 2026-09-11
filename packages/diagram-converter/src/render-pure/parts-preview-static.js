import { parseDSLParts } from "../parser.js";
import { htmlEl } from "./html-utils.js";
import { renderBlockPreviewSvg, renderPropPreviewSvg } from "./parts-preview-core.js";

/**
 * `showLabel: false` renders just the shape — the id caption is dropped, not
 * hidden, because a caller using this as a small inline icon next to its own
 * text label (the id, absent a `label:` property) would otherwise show that
 * same string twice right next to each other.
 */
function renderPropPreviewItem(prop, theme, showLabel = true) {
  const children = [renderPropPreviewSvg(prop, theme)];
  if (showLabel) {
    children.push(
      htmlEl(
        "span",
        {
          style: {
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "10px",
            color: "#78716c",
          },
        },
        prop.id,
      ),
    );
  }
  return htmlEl(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        flexShrink: "0",
      },
    },
    children,
  );
}

/** Same trade-off as `renderPropPreviewItem`, for a block. */
function renderBlockPreviewItem(block, theme, showLabel = true) {
  const children = [renderBlockPreviewSvg(block, theme)];
  if (showLabel) {
    children.push(
      htmlEl(
        "span",
        {
          style: {
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "10px",
            color: "#78716c",
          },
        },
        block.id,
      ),
    );
  }
  return htmlEl(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        flexShrink: "0",
      },
    },
    children,
  );
}

/**
 * SSR / VS Code preview — inline styles only (no Tailwind).
 *
 * `compact: true` drops the id caption under each shape and the outer
 * padding, for a caller that shows a preview as a small inline icon beside
 * its own text label — a design gallery wants the caption, an icon next to
 * a label does not, since blocks and props are commonly left without a
 * `label:` property and the caption then repeats the id twice.
 */
export function renderPartsPreviewHtml(code, theme, { compact = false } = {}) {
  const { blocks, props, errors } = parseDSLParts(code);

  if (errors.length > 0) {
    return htmlEl(
      "p",
      { style: { color: "#b91c1c", fontSize: "12px", margin: "12px 0" } },
      errors[0].msg,
    );
  }

  const blockList = Object.values(blocks);
  const propList = Object.values(props);

  if (blockList.length === 0 && propList.length === 0) {
    return htmlEl(
      "p",
      { style: { color: "#78716c", fontSize: "12px", margin: "12px 0" } },
      "No block or prop definitions.",
    );
  }

  const sections = [];
  if (blockList.length > 0) {
    sections.push(
      htmlEl(
        "div",
        {
          style: {
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            justifyContent: "center",
          },
        },
        blockList.map((block) => renderBlockPreviewItem(block, theme, !compact)),
      ),
    );
  }
  if (propList.length > 0) {
    sections.push(
      htmlEl(
        "div",
        {
          style: {
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            justifyContent: "center",
          },
        },
        propList.map((prop) => renderPropPreviewItem(prop, theme, !compact)),
      ),
    );
  }

  return htmlEl(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: compact ? "0" : "16px",
        padding: compact ? "0" : "12px",
        background: compact ? "transparent" : theme.bg,
      },
    },
    sections,
  );
}
