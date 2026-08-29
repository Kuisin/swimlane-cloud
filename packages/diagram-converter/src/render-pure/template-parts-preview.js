import { parseDSLParts } from "../parser.js";
import { htmlEl } from "./html-utils.js";
import { renderBlockPreviewSvg, renderPropPreviewSvg } from "./parts-preview-core.js";

function renderPropPreviewItem(prop, theme) {
  return htmlEl("div", { className: "flex flex-col items-center gap-1 shrink-0" }, [
    renderPropPreviewSvg(prop, theme),
    htmlEl("span", { className: "font-mono text-[10px] text-stone-500" }, prop.id),
  ]);
}

function renderBlockPreviewItem(block, theme) {
  return htmlEl("div", { className: "flex flex-col items-center gap-1 shrink-0" }, [
    renderBlockPreviewSvg(block, theme),
    htmlEl("span", { className: "font-mono text-[10px] text-stone-500" }, block.id),
  ]);
}

/** Web template gallery preview — Tailwind class names on wrappers. */
export function renderTemplatePartsPreviewHtml(code, theme) {
  const { blocks, props, errors } = parseDSLParts(code);

  if (errors.length > 0) {
    return htmlEl("p", { className: "text-xs text-red-600 font-jp px-2 py-3" }, errors[0].msg);
  }

  const blockList = Object.values(blocks);
  const propList = Object.values(props);

  if (blockList.length === 0 && propList.length === 0) {
    return htmlEl(
      "p",
      { className: "text-xs text-stone-500 font-jp px-2 py-3" },
      "定義がありません",
    );
  }

  const sections = [];
  if (blockList.length > 0) {
    sections.push(
      htmlEl(
        "div",
        { className: "flex flex-wrap gap-4 justify-center" },
        blockList.map((block) => renderBlockPreviewItem(block, theme)),
      ),
    );
  }
  if (propList.length > 0) {
    sections.push(
      htmlEl(
        "div",
        { className: "flex flex-wrap gap-4 justify-center" },
        propList.map((prop) => renderPropPreviewItem(prop, theme)),
      ),
    );
  }

  return htmlEl("div", { className: "flex flex-col gap-4 p-3" }, sections);
}
