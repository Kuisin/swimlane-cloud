import { parseDSLParts } from "../parser.js";
import { htmlEl } from "./html-utils.js";
import { renderBlockPreviewSvg, renderPropPreviewSvg } from "./parts-preview-core.js";

function renderPropPreviewItem(prop, theme) {
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
    [
      renderPropPreviewSvg(prop, theme),
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
    ],
  );
}

function renderBlockPreviewItem(block, theme) {
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
    [
      renderBlockPreviewSvg(block, theme),
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
    ],
  );
}

/** SSR / VS Code preview — inline styles only (no Tailwind). */
export function renderPartsPreviewHtml(code, theme) {
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
        blockList.map((block) => renderBlockPreviewItem(block, theme)),
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
        propList.map((prop) => renderPropPreviewItem(prop, theme)),
      ),
    );
  }

  return htmlEl(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "12px",
        background: theme.bg,
      },
    },
    sections,
  );
}
