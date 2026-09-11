/**
 * The DSL reader's entry point.
 *
 * There is one grammar, read by `parser-v2.js` behind the plain
 * `@kai-swimlane` header. The earlier grammar (`if … is … than`, `elseif`,
 * `merge: id;`, property lines for a step's id and props) is not read any
 * more; `legacy-migrate.js` rewrites a file written in it, once.
 */
import { parseDSLv2 } from "./parser-v2.js";

export {
  ASSET_EXTENSIONS,
  ASSET_MAX_BYTES,
  ASSET_TOTAL_MAX_BYTES,
  checkImportPath,
  dirOf,
  dslVersion,
  parseDSLv2,
  scanImports,
} from "./parser-v2.js";

/** Whole-line comments (ignored in all sections). */
export function isDslCommentLine(trimmed) {
  return (trimmed || "").trim().startsWith("//");
}

/** Unescape so `&lt;block01&gt;` and similar are parsed like `<block01>`. */
export function unescapeDslLine(line) {
  return line
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

/**
 * 出現順の表示番号。skipIndex の行は件数に含めず番号なし。
 *
 * A step's `level` nests its number under the previous shallower step:
 * level 1 counts 1, 2, 3; a level-2 step after "2" is 2-1, then 2-2; a
 * level-3 step after that is 2-2-1. A sub-step with no parent yet counts
 * under an implicit "1".
 */
export function buildStepRowDisplayInfo(rows) {
  const out = new Map();
  const counters = [];
  rows.forEach((r, i) => {
    if (r.kind !== "step" || r.empty || !r.role) return;
    if (r.skipIndex) {
      out.set(i, { skipped: true });
      return;
    }
    const level = Math.max(1, Math.floor(Number(r.level) || 1));
    while (counters.length < level - 1) counters.push(1);
    counters.length = level;
    counters[level - 1] = (counters[level - 1] || 0) + 1;
    out.set(i, { displayIndex: counters.join("-"), level });
  });
  return out;
}

/**
 * Parse a document. `parseOptions` carries `lang` (which declared language
 * to render), `resolveImport` / `resolveAsset` (the text of an `@use`
 * fragment / the data URI of an `@use` image) and `filename`.
 */
export function parseDSL(src, parseOptions = {}) {
  return parseDSLv2(src, parseOptions);
}

/** Parse /block/ and /prop/ fragments (wraps for parseDSL; not for clipboard). */
export function parseDSLParts(src) {
  const body = src.trim();
  const wrapped = `@kai-swimlane\n/title/\nparts\n\n${body}\n/role/\n<__parts_preview__>\nlabel: parts;\n/line/\n[__parts_preview__: parts]\n@end\n`;
  const model = parseDSL(wrapped);
  return {
    blocks: model.blocks,
    props: model.props,
    errors: model.errors,
    warnings: model.warnings ?? [],
  };
}
