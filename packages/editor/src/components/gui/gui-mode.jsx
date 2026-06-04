import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useT } from "../../i18n.jsx";
import { useDragWidth } from "../../hooks/use-drag-width.js";
import { parseGuiModel, applyModelEdit } from "../../lib/gui-model.js";
import {
  findAdjacentStepIndex,
  getReorderBounds,
  resolveInspectorTarget,
  swapStepRows,
  moveRow,
} from "../../lib/flow-rows.js";
import { buildLockedGuiRowIndices } from "../../lib/parse-error-policy.js";
import { FlowStepList } from "./flow-step-list.jsx";
import { StepInspector } from "./step-inspector.jsx";
import { BranchInspector } from "./branch-inspector.jsx";
import { MoveStepModal } from "./move-step-modal.jsx";

/**
 * GUI editing surface over the same DSL document. Parses `src` to a GUI model,
 * renders the flow list + a row inspector, and writes edits back as DSL via
 * `applyModelEdit` (re-parse → mutate row → re-serialize), so the round-trip is
 * lossless and identical to text mode.
 */
export function GuiMode({ src, onChange, readOnly, theme }) {
  const { t } = useT();
  const inspector = useDragWidth(300, { min: 220, max: 520, edge: "left" });
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showMove, setShowMove] = useState(false);
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

  /** Move a step row to a specific rows index (drag-drop or "Move to…"). */
  function moveStepTo(from, to) {
    let landed = from;
    commit((draft) => {
      const result = moveRow(draft.rows, from, to);
      draft.rows = result.rows;
      landed = result.index;
    });
    setSelectedIndex(landed);
    setShowMove(false);
  }

  function addStep() {
    const firstLane = guiModel.lanes[0]?.id || "";
    commit((draft) => {
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : draft.rows.length;
      draft.rows.splice(insertAt, 0, {
        kind: "step",
        role: firstLane,
        text: t("gui.newStepText"),
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
          <span>{t("gui.flow")}</span>
          {!readOnly && (
            <button type="button" className="sw-btn sw-btn-sm" onClick={addStep}>
              <Plus size={13} /> {t("gui.addStep")}
            </button>
          )}
        </div>
        <FlowStepList
          rows={rows}
          lanes={guiModel.lanes}
          selectedIndex={selectedIndex}
          lockedRows={lockedRows}
          canReorder={!readOnly}
          onReorder={moveStepTo}
          onSelect={setSelectedIndex}
        />
      </div>
      <div
        className="sw-resizer"
        role="separator"
        aria-orientation="vertical"
        onMouseDown={inspector.startDrag}
        onTouchStart={inspector.startDrag}
      />
      <div
        className="sw-gui-inspector-pane"
        style={{ width: inspector.width, flex: "0 0 auto" }}
      >
        {isStep ? (
          <StepInspector
            row={inspectorRow}
            lanes={guiModel.lanes}
            blocks={guiModel.blocks}
            props={guiModel.props}
            src={src}
            theme={theme}
            reorder={reorder}
            readOnly={readOnly}
            onPatch={patchRow}
            onMove={moveStep}
            onOpenMove={() => setShowMove(true)}
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
          <div className="sw-gui-empty">{t("gui.selectRow")}</div>
        )}
      </div>

      <MoveStepModal
        open={showMove && isStep && saveIndex >= 0}
        rows={rows}
        currentIndex={saveIndex}
        lanes={guiModel.lanes}
        onMove={(to) => moveStepTo(saveIndex, to)}
        onClose={() => setShowMove(false)}
      />
    </div>
  );
}
