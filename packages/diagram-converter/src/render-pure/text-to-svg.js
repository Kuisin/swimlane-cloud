import { parseDSL } from "../parser.js";
import { resolveDiagramOptions } from "../diagram-options.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";

/**
 * Convert DSL text to an SVG string.
 * Platform-free: works in Node.js, browsers, and workers — no React, no DOM.
 *
 * @param {string} src
 * @param {{ theme?: object, themeKey?: string }} [options]
 * @returns {{ svg: string | null, model: object, errors: Array }}
 */
export function textToSvg(src, { theme, themeKey } = {}) {
  const model = parseDSL(src);
  const resolvedTheme =
    theme ?? (themeKey ? THEMES[themeKey] : null) ?? THEMES.basic;
  const opts = resolveDiagramOptions(model.options);
  try {
    const svg = renderDiagramSvg({ model, theme: resolvedTheme, ...opts });
    return { svg, model, errors: model.errors };
  } catch (err) {
    return {
      svg: null,
      model,
      errors: [...model.errors, { line: 0, text: "", msg: err.message }],
    };
  }
}
