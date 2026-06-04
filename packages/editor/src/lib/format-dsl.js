import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { serializeDSL } from "./serialize-dsl.js";
import { normalizeBranchRows } from "./flow-rows.js";

/**
 * Parse and re-serialize DSL into the canonical layout. Returns
 * `{ ok: true, value }` or `{ ok: false, errors }` when the source has
 * parse errors (formatting unparseable text would lose content).
 */
export function formatDsl(src) {
  const model = parseDSL(src);
  if (model.errors?.length) return { ok: false, errors: model.errors };
  model.rows = normalizeBranchRows(model.rows);
  return { ok: true, value: serializeDSL(model) };
}
