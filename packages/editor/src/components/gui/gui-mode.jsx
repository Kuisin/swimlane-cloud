import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { parseGuiModel, applyModelEdit } from "../../lib/gui-model.js";
import {
  findAdjacentStepIndex,
  getReorderBounds,
  resolveInspectorTarget,
  swapStepRows,
} from "../../lib/flow-rows.js";
import { buildLockedGuiRowIndices } from "../../lib/parse-error-policy.js";
import { FlowStepList } from "./flow-step-list.jsx";
import { StepInspector } from "./step-inspector.jsx";
import { BranchInspector } from "./branch-inspector.jsx";

/**
 * GUI editing surface over the same DSL document. Parses `src` to a GUI model,
 * renders the flow list + a row inspector, and writes edits back as DSL via
 * `applyModelEdit` (re-parse → mutate row → re-serialize), so the round-trip is
 * lossless and identical to text mode.
 */
export function GuiMode({ src, onChange, readOnly }) {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const guiModel = useMemo(() => parseGuiModel(src), [src]);
  const rows = guiModel.rows;
  const lockedRows = useMemo(
    () => buildLockedGuiRowIndices(rows, guiModel.errors),
    [rows, guiModel.errors],
  );

  const target = resolveInspectorTarget(rows, selectedIndex);
  const inspectorRow = target.inspectorRow;
  const saveIndex = target.saveRowIndex;

  function commit(editFn) {
    if (readOnly) return;
    onChange(applyModelEdit(src, editFn));
  }

  function patchRow(patch) {
    if (saveIndex < 0) return;
    commit((draft) => {
      if (draft.rows[saveIndex]) {
        draft.rows[saveIndex] = { ...draft.rows[saveIndex], ...patch };
      }
    });
  }

  function deleteRow() {
    if (saveIndex < 0) return;
    commit((draft) => {
      draft.rows.splice(saveIndex, 1);
    });
    setSelectedIndex(-1);
  }

  function moveStep(direction) {
    const adj = findAdjacentStepIndex(rows, selectedIndex, direction);
    if (adj < 0) return;
    commit((draft) => {
      draft.rows = swapStepRows(draft.rows, selectedIndex, adj);
    });
    setSelectedIndex(adj);
  }

  function addStep() {
    const firstLane = guiModel.lanes[0]?.id || "";
    commit((draft) => {
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : draft.rows.length;
      draft.rows.splice(insertAt, 0, {
        kind: "step",
        role: firstLane,
        text: "New step",
        depth: 0,
      });
    });
  }

  const isStep = inspectorRow?.kind === "step" && !inspectorRow.empty;
  const reorder = isStep ? getReorderBounds(rows, saveIndex) : null;

  return (
    <div className="sw-gui">
      <div className="sw-gui-list-pane">
        <div className="sw-gui-list-head">
          <span>Flow</span>
          {!readOnly && (
            <button type="button" className="sw-btn sw-btn-sm" onClick={addStep}>
              <Plus size={13} /> Add step
            </button>
          )}
        </div>
        <FlowStepList
          rows={rows}
          lanes={guiModel.lanes}
          selectedIndex={selectedIndex}
          lockedRows={lockedRows}
          onSelect={setSelectedIndex}
        />
      </div>
      <div className="sw-gui-inspector-pane">
        {isStep ? (
          <StepInspector
            row={inspectorRow}
            lanes={guiModel.lanes}
            blocks={guiModel.blocks}
            props={guiModel.props}
            reorder={reorder}
            readOnly={readOnly}
            onPatch={patchRow}
            onMove={moveStep}
            onDelete={deleteRow}
          />
        ) : inspectorRow ? (
          <BranchInspector
            row={inspectorRow}
            readOnly={readOnly}
            onPatch={patchRow}
            onDelete={deleteRow}
          />
        ) : (
          <div className="sw-gui-empty">Select a row to edit it.</div>
        )}
      </div>
    </div>
  );
}
