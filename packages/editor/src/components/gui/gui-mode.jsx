import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Settings } from "lucide-react";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
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
import { FileSettingsModal } from "./file-settings-modal.jsx";
import { PreviewPane } from "../preview-pane.jsx";
import { ErrorList } from "../error-list.jsx";

/**
 * GUI editing surface over the same DSL document. Parses `src` to a GUI model,
 * renders the flow list + a row inspector, and writes edits back as DSL via
 * `applyModelEdit` (re-parse → mutate row → re-serialize), so the round-trip is
 * lossless and identical to text mode.
 *
 * Lays out three independently resizable columns: the step list and the detail
 * inspector each own a saved pixel width (resizable from their right edge), and
 * the live preview fills whatever space is left. Widths persist in localStorage.
 */
export function GuiMode({ src, onChange, readOnly, theme, svg, errors }) {
  const { t } = useT();
  const stepList = useDragWidth(260, {
    min: 180,
    max: 520,
    edge: "right",
    storageKey: "sw-editor:gui-steplist-w",
  });
  const detail = useDragWidth(360, {
    min: 240,
    max: 720,
    edge: "right",
    storageKey: "sw-editor:gui-detail-w",
  });
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showMove, setShowMove] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [blockMenuPos, setBlockMenuPos] = useState(null);
  const blockMenuRef = useRef(null);

  useEffect(() => {
    if (!blockMenuOpen) return;
    function handleClick(e) {
      if (blockMenuRef.current && !blockMenuRef.current.contains(e.target)) {
        setBlockMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [blockMenuOpen]);
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
    if (readOnly) return;
    let landed = from;
    const next = applyModelEdit(src, (draft) => {
      const result = moveRow(draft.rows, from, to);
      draft.rows = result.rows;
      landed = result.index;
    });
    // Reject a move (e.g. an invalid cross-group drop) that adds parse errors.
    const before = parseDSL(src).errors?.length ?? 0;
    const after = parseDSL(next).errors?.length ?? 0;
    setShowMove(false);
    if (after > before) return;
    onChange(next);
    setSelectedIndex(landed);
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

  function newBranchId() {
    return Math.random().toString(36).slice(2, 8);
  }

  function addIfBranch() {
    const id = newBranchId();
    commit((draft) => {
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : draft.rows.length;
      draft.rows.splice(
        insertAt, 0,
        { kind: "branchStart", id, cond: "condition" },
        { kind: "branchCase", id, label: "Case 1" },
        { kind: "branchCase", id, label: "else" },
        { kind: "branchEnd", id },
      );
    });
    setBlockMenuOpen(false);
  }

  function addFork() {
    const id = newBranchId();
    commit((draft) => {
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : draft.rows.length;
      draft.rows.splice(
        insertAt, 0,
        { kind: "branchStart", id, parallel: true },
        { kind: "branchCase", id, parallel: true },
        { kind: "branchCase", id, parallel: true },
        { kind: "branchEnd", id, parallel: true },
      );
    });
    setBlockMenuOpen(false);
  }

  function addSection() {
    const id = newBranchId();
    commit((draft) => {
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : draft.rows.length;
      draft.rows.splice(
        insertAt, 0,
        { kind: "groupStart", id, groupMode: "section", sectionName: "" },
        { kind: "groupEnd", id, groupMode: "section" },
      );
    });
    setBlockMenuOpen(false);
  }

  function handleBlockMenuToggle() {
    if (!blockMenuOpen && blockMenuRef.current) {
      const rect = blockMenuRef.current.getBoundingClientRect();
      setBlockMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setBlockMenuOpen((v) => !v);
  }

  const isStep = inspectorRow?.kind === "step" && !inspectorRow.empty;
  const reorder = isStep ? getReorderBounds(rows, saveIndex) : null;

  return (
    <div className="sw-gui-wrap">
      <div className="sw-gui">
      <div
        className="sw-gui-list-pane"
        style={{ width: stepList.width, flex: "0 0 auto" }}
      >
        <div className="sw-gui-list-head">
          <span>{t("gui.flow")}</span>
          <div className="sw-gui-list-actions">
            {!readOnly && (
              <div className="sw-add-block-wrap" ref={blockMenuRef}>
                <div className="sw-add-block-btn">
                  <button type="button" className="sw-add-block-main sw-btn sw-btn-sm" onClick={addStep}>
                    <Plus size={13} /> {t("gui.addStep")}
                  </button>
                  <button
                    type="button"
                    className="sw-add-block-caret sw-btn sw-btn-sm"
                    onClick={handleBlockMenuToggle}
                    title={t("gui.addBlock")}
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
                {blockMenuOpen && blockMenuPos && (
                  <div
                    className="sw-add-block-menu"
                    style={{ position: "fixed", top: blockMenuPos.top, left: blockMenuPos.left }}
                  >
                    <button type="button" className="sw-add-block-item" onClick={addIfBranch}>
                      {t("gui.addIfBranch")}
                    </button>
                    <button type="button" className="sw-add-block-item" onClick={addFork}>
                      {t("gui.addFork")}
                    </button>
                    <button type="button" className="sw-add-block-item" onClick={addSection}>
                      {t("gui.addSection")}
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              className="sw-icon-btn"
              title={t("file.settings")}
              onClick={() => setShowSettings(true)}
            >
              <Settings size={14} />
            </button>
          </div>
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
        onMouseDown={stepList.startDrag}
        onTouchStart={stepList.startDrag}
      />
      <div
        className="sw-gui-inspector-pane"
        style={{ width: detail.width, flex: "0 0 auto" }}
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
      <div
        className="sw-resizer"
        role="separator"
        aria-orientation="vertical"
        onMouseDown={detail.startDrag}
        onTouchStart={detail.startDrag}
      />
      <div className="sw-gui-preview-pane sw-preview-pane">
        <PreviewPane svg={svg} hasErrors={errors?.length > 0} />
      </div>
      </div>

      <ErrorList errors={errors} onSelectLine={() => {}} />

      <MoveStepModal
        open={showMove && isStep && saveIndex >= 0}
        rows={rows}
        currentIndex={saveIndex}
        lanes={guiModel.lanes}
        onMove={(to) => moveStepTo(saveIndex, to)}
        onClose={() => setShowMove(false)}
      />

      <FileSettingsModal
        open={showSettings}
        src={src}
        readOnly={readOnly}
        onChange={onChange}
        onClose={() => setShowSettings(false)}
        theme={theme}
      />
    </div>
  );
}
