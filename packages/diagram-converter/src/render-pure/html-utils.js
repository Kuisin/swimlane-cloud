/** HTML element builder for parts preview wrappers. */
import { escapeText, escapeAttr, styleObjectToString } from "./svg-utils.js";

/**
 * @param {string} tag
 * @param {Record<string, unknown>} [attrs]
 * @param {string | string[]} [children]
 */
export function htmlEl(tag, attrs = {}, children = "") {
  const resolvedTag = tag === "motionless-div" ? "div" : tag;
  const parts = [`<${resolvedTag}`];
  for (const [key, rawValue] of Object.entries(attrs)) {
    if (rawValue == null || rawValue === false) continue;
    if (key === "className") {
      parts.push(` class="${escapeAttr(rawValue)}"`);
      continue;
    }
    if (key === "style" && rawValue && typeof rawValue === "object") {
      parts.push(
        ` style="${escapeAttr(styleObjectToString(/** @type {Record<string, unknown>} */ (rawValue)))}"`,
      );
      continue;
    }
    parts.push(` ${key}="${escapeAttr(rawValue)}"`);
  }
  const childStr = Array.isArray(children) ? children.filter(Boolean).join("") : children;
  if (!childStr && /^(?:img|br|hr|input|meta|link)$/.test(resolvedTag)) {
    return `${parts.join("")} />`;
  }
  return `${parts.join("")}>${childStr}</${resolvedTag}>`;
}
