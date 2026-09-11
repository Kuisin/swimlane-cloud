import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { serializeDSL } from "./serialize-dsl.js";
import { normalizeBranchRows } from "./flow-rows.js";

/** Parse `prevSrc`, run `editFn` on a mutable model draft, re-serialize. */
export function applyModelEdit(prevSrc, editFn) {
  const draft = structuredClone(parseDSL(prevSrc));
  draft.rows = normalizeBranchRows(draft.rows);
  const before = {
    roles: new Set(Object.keys(draft.roles || {})),
    blocks: new Set(Object.keys(draft.blocks || {})),
    props: new Set(Object.keys(draft.props || {})),
  };
  const result = editFn(draft);
  const model = result ?? draft;
  model.rows = normalizeBranchRows(model.rows);
  syncDefinitions(model, before);
  return serializeDSL(model);
}

/**
 * The GUI edits `lanes` (roles) and the `blocks` / `props` bags, while the
 * serializer writes `/role/`, `/block/`, `/prop/` from `roles` and
 * `localDefIds` — the ids this file defines itself, as opposed to ones a
 * `@use` fragment supplies. Bring those into step after an edit: a lane the
 * GUI added becomes a local role, one it removed is dropped, and a block or
 * prop that did not exist before the edit is local too.
 */
function syncDefinitions(model, before) {
  const local = {
    role: new Set(model.localDefIds?.role || []),
    block: new Set(model.localDefIds?.block || []),
    prop: new Set(model.localDefIds?.prop || []),
  };

  if (Array.isArray(model.lanes)) {
    const roles = {};
    const keep = new Set(model.lanes.map((l) => l.id));
    for (const lane of model.lanes) {
      const prev = model.roles?.[lane.id] || {};
      roles[lane.id] = {
        ...prev,
        id: lane.id,
        label: lane.label ?? prev.label,
        textColor: lane.textColor ?? prev.textColor,
        bg: lane.bg ?? prev.bg,
        icon: lane.icon ?? prev.icon,
        ...(lane.unknown ? { unknown: lane.unknown } : {}),
      };
      if (!before.roles.has(lane.id) || local.role.has(lane.id)) local.role.add(lane.id);
    }
    // A role a fragment supplied that the GUI never saw stays untouched.
    for (const [id, role] of Object.entries(model.roles || {})) {
      if (!keep.has(id) && !local.role.has(id)) roles[id] = role;
    }
    for (const id of [...local.role]) if (!keep.has(id)) local.role.delete(id);
    model.roles = roles;
  }

  for (const [kind, bag, prev] of [
    ["block", model.blocks, before.blocks],
    ["prop", model.props, before.props],
  ]) {
    const ids = new Set(Object.keys(bag || {}));
    for (const id of ids) if (!prev.has(id)) local[kind].add(id);
    for (const id of [...local[kind]]) if (!ids.has(id)) local[kind].delete(id);
  }

  model.localDefIds = {
    role: [...local.role],
    block: [...local.block],
    prop: [...local.prop],
  };
}

/** GUI view model: branchStart.firstCase always shown as its own branchCase row. */
export function parseGuiModel(src, options) {
  const model = parseDSL(src, options);
  return { ...model, rows: normalizeBranchRows(model.rows) };
}
