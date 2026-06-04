/**
 * Merge a section template body into the active document model.
 *
 * Ported/adapted from the reference `template-catalog.js`. Block/prop bodies are
 * parsed with `parseDSLParts`; role bodies are wrapped and parsed; page/option
 * fields are merged onto the model. The result is re-serialized to DSL.
 */
import { parseDSL, parseDSLParts } from "@swimlane-cloud/diagram-converter/parser";
import { serializeDSL } from "./serialize-dsl.js";
import { normalizeBranchRows } from "./flow-rows.js";

export function mergeSectionTemplate(src, section, body) {
  const model = structuredClone(parseDSL(src));
  model.rows = normalizeBranchRows(model.rows);

  switch (section) {
    case "block":
    case "prop": {
      const { blocks, props } = parseDSLParts(body);
      model.blocks = { ...(model.blocks || {}), ...(blocks || {}) };
      model.props = { ...(model.props || {}), ...(props || {}) };
      break;
    }
    case "role": {
      const wrapped = `@kai-swimlane\n/role/\n${body}\n/line/\n@end\n`;
      const parsed = parseDSL(wrapped);
      const lanes = [...(model.lanes || [])];
      for (const lane of parsed.lanes || []) {
        const idx = lanes.findIndex((l) => l.id === lane.id);
        if (idx >= 0) lanes[idx] = { ...lanes[idx], ...lane };
        else lanes.push(lane);
      }
      model.lanes = lanes;
      break;
    }
    case "page": {
      const wrapped = `@kai-swimlane\n/page/\n${body}\n/line/\n@end\n`;
      const parsed = parseDSL(wrapped);
      model.page = { ...(model.page || {}), ...(parsed.page || {}) };
      break;
    }
    case "option": {
      const wrapped = `@kai-swimlane\n/option/\n${body}\n/line/\n@end\n`;
      const parsed = parseDSL(wrapped);
      model.options = { ...(model.options || {}), ...(parsed.options || {}) };
      model.providedColumnTitles = [
        ...new Set([
          ...(model.providedColumnTitles || []),
          ...(parsed.providedColumnTitles || []),
        ]),
      ];
      // page may carry column titles from the option section
      model.page = { ...(model.page || {}), ...(parsed.page || {}) };
      break;
    }
    default:
      break;
  }

  return serializeDSL(model);
}
