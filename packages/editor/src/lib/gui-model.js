import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { serializeDSL } from "./serialize-dsl.js";
import { normalizeBranchRows } from "./flow-rows.js";

/** Parse `prevSrc`, run `editFn` on a mutable model draft, re-serialize. */
export function applyModelEdit(prevSrc, editFn) {
  const draft = structuredClone(parseDSL(prevSrc));
  draft.rows = normalizeBranchRows(draft.rows);
  const result = editFn(draft);
  const model = result ?? draft;
  model.rows = normalizeBranchRows(model.rows);
  return serializeDSL(model);
}

/** GUI view model: branchStart.firstCase always shown as its own branchCase row. */
export function parseGuiModel(src) {
  const model = parseDSL(src);
  return { ...model, rows: normalizeBranchRows(model.rows) };
}
