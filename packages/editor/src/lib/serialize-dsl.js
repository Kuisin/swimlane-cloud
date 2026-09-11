/**
 * Model → DSL text. There is one grammar, written by `serialize-dsl-v2.js`;
 * this is the entry point every caller uses.
 */
import { serializeDSLv2 } from "./serialize-dsl-v2.js";

export function serializeDSL(model) {
  return serializeDSLv2(model);
}
