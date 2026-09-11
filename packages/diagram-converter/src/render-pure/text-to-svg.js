import { parseDSL } from "../parser.js";
import { resolveDiagramOptions } from "../diagram-options.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";
import { diffModels } from "./row-diff.js";

/**
 * Convert DSL text to an SVG string.
 * Platform-free: works in Node.js, browsers, and workers — no React, no DOM.
 *
 * `lang` picks the render language of a version 2 diagram that declares
 * several. `resolveImport` supplies the text of an `@use` fragment and
 * `resolveAsset` the `data:` URI of an `@use` image. All three are ignored by
 * the version 1 reader.
 *
 * `diagramDefaults` are render options the document inherits — a
 * repository-wide setting — which its own `/option/` section overrides.
 * `diagramDefaults.layout` overrides the page geometry (margins, gutter
 * widths, lane grid). It rides the same object but, unlike the keys above, is
 * not an `/option/` key, so a diagram cannot override it: the page layout is
 * repository-wide only.
 * `documentInfo` (`{ path, meta }`) is drawn top-right for a printed image;
 * `linkHref(link, row)` turns a step's link into an `<a href>` when the host
 * can name a URL for it.
 *
 * @param {string} src
 * @param {{ theme?: object, themeKey?: string, lang?: string,
 *   resolveImport?: (path: string) => string | null,
 *   resolveAsset?: (path: string) => string | null,
 *   filename?: string, diagramDefaults?: object }} [options]
 * @returns {{ svg: string | null, model: object, errors: Array }}
 */
export function textToSvg(
  src,
  {
    theme,
    themeKey,
    lang,
    resolveImport,
    resolveAsset,
    filename,
    diagramDefaults,
    documentInfo,
    linkHref,
  } = {},
) {
  const model = parseDSL(src, { lang, resolveImport, resolveAsset, filename });
  const resolvedTheme = theme ?? (themeKey ? THEMES[themeKey] : null) ?? THEMES.basic;
  const opts = resolveDiagramOptions(model.options, diagramDefaults);
  try {
    const svg = renderDiagramSvg({
      model,
      theme: resolvedTheme,
      ...opts,
      documentInfo,
      linkHref,
    });
    return { svg, model, errors: model.errors };
  } catch (err) {
    return {
      svg: null,
      model,
      errors: [...model.errors, { line: 0, text: "", msg: err.message }],
    };
  }
}

/**
 * The "after" diagram drawn with the change from "before" marked on it: added
 * and changed rows outlined with a badge, a changed caption shown as inline
 * tracked changes, and a removed row left in as a struck-through ghost.
 *
 * The picture is the new diagram — options, theme and language all come from
 * `afterSrc`; `beforeSrc` is only ever read for its rows. A host can hide every
 * annotation at once by putting the class `diff-hidden` on the `<svg>` or any
 * ancestor, which reverts it to the plain "after" render.
 *
 * @param {string} beforeSrc DSL as it was ("" for a file that did not exist)
 * @param {string} afterSrc DSL as it is now ("" for a deleted file)
 * @param {Parameters<typeof textToSvg>[1]} [options] as `textToSvg`
 * @returns {{ svg: string | null, model: object, diffRows: Map<number, object>, errors: Array }}
 */
export function textDiffToSvg(beforeSrc, afterSrc, options = {}) {
  const { theme, themeKey, lang, resolveImport, resolveAsset, filename, diagramDefaults } = options;
  const parseOptions = { lang, resolveImport, resolveAsset, filename };
  const oldModel = parseDSL(beforeSrc ?? "", parseOptions);
  const newModel = parseDSL(afterSrc ?? "", parseOptions);
  const { model, diffRows } = diffModels(oldModel, newModel);
  const resolvedTheme = theme ?? (themeKey ? THEMES[themeKey] : null) ?? THEMES.basic;
  const opts = resolveDiagramOptions(newModel.options, diagramDefaults);
  try {
    const svg = renderDiagramSvg({
      model,
      theme: resolvedTheme,
      ...opts,
      documentInfo: options.documentInfo,
      linkHref: options.linkHref,
      diffRows,
    });
    return { svg, model, diffRows, errors: newModel.errors };
  } catch (err) {
    return {
      svg: null,
      model,
      diffRows,
      errors: [...newModel.errors, { line: 0, text: "", msg: err.message }],
    };
  }
}
