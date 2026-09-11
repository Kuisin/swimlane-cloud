import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Settings } from "lucide-react";
import { renderDiagramSvg } from "@swimlane-cloud/diagram-converter";
import { resolveDiagramOptions } from "@swimlane-cloud/diagram-converter/diagram-options";
import { THEMES } from "@swimlane-cloud/diagram-converter/themes";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { useT } from "../../i18n.jsx";
import { useEditor } from "../../context/editor-context.js";
import { useDragWidth } from "../../hooks/use-drag-width.js";
import { parseGuiModel, applyModelEdit } from "../../lib/gui-model.js";
import {
  findAdjacentStepIndex,
  findBranchEndIndex,
  getReorderBounds,
  isStepRow,
  makeStepId,
  pruneUnreferencedStepIds,
  resolveInspectorTarget,
  swapStepRows,
  moveRow,
} from "../../lib/flow-rows.js";
import { findEnclosingBranchStart } from "../../lib/branch-rows.js";
import { buildLockedGuiRowIndices } from "../../lib/parse-error-policy.js";
import { AddStepMenu } from "./add-step-menu.jsx";
import { FlowStepList } from "./flow-step-list.jsx";
import { StepInspector } from "./step-inspector.jsx";
import { BranchInspector } from "./branch-inspector.jsx";
import { MoveStepModal } from "./move-step-modal.jsx";
import { FileSettingsModal } from "./file-settings-modal.jsx";
import { StarterGallery } from "./starter-gallery.jsx";
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
export function GuiMode({
  src,
  onChange,
  readOnly,
  theme,
  svg,
  errors,
  parseOptions,
  diagramDefaults,
  documentInfo,
  onLinkClick,
  onSwitchToText,
  /** One pane at a time; `pane` says which. See `use-media-query.js`. */
  narrow = false,
  pane = "flow",
}) {
  const { t } = useT();
  const { files, activeDocumentId } = useEditor();
  // Every other diagram file, for the step inspector's "link to another flow".
  const linkTargets = useMemo(
    () =>
      (files || [])
        .filter((f) => f.id !== activeDocumentId && /\.(txt|md)$/i.test(f.id))
        .map((f) => ({ id: f.id, label: f.id })),
    [files, activeDocumentId],
  );
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
  const [dropOpen, setDropOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const chevronRef = useRef(null);
  // Same resolved imports as the visible error list, or a row near an @use
  // line can be locked here for an error the banner above no longer shows.
  const guiModel = useMemo(() => parseGuiModel(src, parseOptions), [src, parseOptions]);
  const rows = guiModel.rows;
  const lockedRows = useMemo(
    () => buildLockedGuiRowIndices(rows, guiModel.errors),
    [rows, guiModel.errors],
  );

  const interactiveSvg = useMemo(() => {
    if (!guiModel) return null;
    try {
      const opts = resolveDiagramOptions(guiModel.options, diagramDefaults);
      return renderDiagramSvg({
        model: guiModel,
        theme: theme ?? THEMES.basic,
        ...opts,
        documentInfo,
        interactive: true,
        selectedRowIndex: selectedIndex >= 0 ? selectedIndex : null,
      });
    } catch {
      return null;
    }
  }, [guiModel, theme, selectedIndex, diagramDefaults, documentInfo]);

  const target = resolveInspectorTarget(rows, selectedIndex);
  const inspectorRow = target.inspectorRow;
  const saveIndex = target.saveRowIndex;

  function commit(editFn) {
    if (readOnly) return;
    // Every GUI-mode mutation is its own discrete undo step — never
    // coalesced with adjacent edits, unlike text-mode typing.
    onChange(applyModelEdit(src, editFn), { tag: "structural" });
  }

  function patchRow(patch) {
    // Defense-in-depth: the inspectors already disable every field for a
    // locked row, but a mutation landing here for one is a no-op regardless.
    if (saveIndex < 0 || lockedRows.has(saveIndex)) return;
    commit((draft) => {
      if (draft.rows[saveIndex]) {
        draft.rows[saveIndex] = { ...draft.rows[saveIndex], ...patch };
      }
    });
  }

  function deleteRow() {
    if (saveIndex < 0 || lockedRows.has(saveIndex)) return;
    // Deleting a jump can leave the step it pointed at holding an id nothing
    // references any more; the same sweep as retargeting clears it.
    const wasJump = ["branchMerge", "branchLoop"].includes(rows[saveIndex]?.kind);
    commit((draft) => {
      draft.rows.splice(saveIndex, 1);
      if (wasJump) draft.rows = pruneUnreferencedStepIds(draft.rows);
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
    onChange(next, { tag: "structural" });
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

  function makeId() {
    return Math.random().toString(36).slice(2, 10);
  }

  function addIfBranch() {
    setDropOpen(false);
    const id = makeId();
    commit((draft) => {
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : draft.rows.length;
      draft.rows.splice(
        insertAt,
        0,
        {
          kind: "branchStart",
          id,
          cond: "Condition",
          firstCase: "Case 1",
          parallel: false,
          branchColor: null,
          depth: 0,
        },
        // A blank label is the catch-all case — there is no "else" spelling.
        { kind: "branchCase", id, label: "", parallel: false, branchColor: null, depth: 0 },
        { kind: "branchEnd", id, parallel: false, depth: 0 },
      );
    });
  }

  function addFork() {
    setDropOpen(false);
    const id = makeId();
    commit((draft) => {
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : draft.rows.length;
      draft.rows.splice(
        insertAt,
        0,
        { kind: "branchStart", id, parallel: true, branchColor: null, depth: 0 },
        { kind: "branchCase", id, parallel: true, branchColor: null, depth: 0 },
        { kind: "branchEnd", id, parallel: true, depth: 0 },
      );
    });
  }

  function addSwitch() {
    setDropOpen(false);
    const id = makeId();
    commit((draft) => {
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : draft.rows.length;
      draft.rows.splice(
        insertAt,
        0,
        {
          kind: "branchStart",
          id,
          cond: "Condition",
          firstCase: "Case A",
          parallel: false,
          branchColor: null,
          depth: 0,
        },
        { kind: "branchCase", id, label: "Case B", parallel: false, branchColor: null, depth: 0 },
        // A blank label is the catch-all case — there is no "else" spelling.
        { kind: "branchCase", id, label: "", parallel: false, branchColor: null, depth: 0 },
        { kind: "branchEnd", id, parallel: false, depth: 0 },
      );
    });
  }

  function addCaseToBranch() {
    const row = rows[saveIndex];
    if (!row || !["branchStart", "branchCase"].includes(row.kind)) return;
    const branchId = row.id;
    const isParallel = Boolean(row.parallel);
    commit((draft) => {
      const startIdx = draft.rows.findIndex((r) => r.kind === "branchStart" && r.id === branchId);
      if (startIdx < 0) return;
      const endIdx = findBranchEndIndex(draft.rows, startIdx);
      if (endIdx < 0) return;
      // Insert immediately before branchEnd so the new case is the last one.
      draft.rows.splice(endIdx, 0, {
        kind: "branchCase",
        id: branchId,
        label: isParallel ? "" : "New case",
        parallel: isParallel,
        branchColor: null,
        depth: 0,
      });
    });
  }

  /**
   * Where a new block may safely be spliced in, given what is selected.
   *
   * `normalizeBranchRows` lifts an `if`'s first case out of the `branchStart`
   * row into a `branchCase` of its own, and the serializer recognises it only
   * by that adjacency. Inserting between the two therefore does not just land
   * in an odd place — it invents a blank `is () than` on the opener, demotes
   * the real first case into an `else-if`, and reparses without an error, so
   * the corruption is silent.
   */
  function insertIndexAfter(rows, index) {
    if (index < 0) return rows.length;
    let at = index + 1;
    if (rows[index]?.kind === "branchStart" && rows[at]?.kind === "branchCase") at++;
    return at;
  }

  function addSection() {
    setDropOpen(false);
    const id = makeId();
    commit((draft) => {
      const insertAt = insertIndexAfter(draft.rows, selectedIndex);
      draft.rows.splice(
        insertAt,
        0,
        { kind: "groupStart", id, groupMode: "section", sectionName: "", depth: 0 },
        { kind: "groupEnd", id, groupMode: "section", depth: 0 },
      );
    });
  }

  function addSubBranch() {
    setDropOpen(false);
    const id = makeId();
    commit((draft) => {
      const insertAt = insertIndexAfter(draft.rows, selectedIndex);
      draft.rows.splice(
        insertAt,
        0,
        { kind: "groupStart", id, groupMode: "branch", sectionName: "", depth: 0 },
        { kind: "groupEnd", id, groupMode: "branch", depth: 0 },
      );
    });
  }

  /**
   * The `if` (non-parallel `branchStart`) enclosing `index` — either because
   * `index` *is* that branchStart, or because it's a case/step nested inside
   * one. Returns its `id`, or null when there's no enclosing `if` (top level,
   * or the enclosing branch is a `fork`, where loop/merge jumps don't apply).
   */
  function enclosingIfId(rowsArg, index) {
    if (index < 0 || !rowsArg[index]) return null;
    const row = rowsArg[index];
    if (row.kind === "branchStart" && !row.parallel) return row.id;
    const startIdx = findEnclosingBranchStart(rowsArg, index);
    if (startIdx < 0) return null;
    const start = rowsArg[startIdx];
    if (!start || start.parallel) return null;
    return start.id;
  }

  /**
   * The id of the step at `index`, giving it one (`id: …;`) if it has none.
   * `[goto: id]` has no bare form, so anything that targets a step has to be
   * able to name it — including a step the author never bothered to name.
   */
  function ensureStepIdAt(draft, index) {
    const step = draft.rows[index];
    const existing = (step?.mergeId || "").trim();
    if (existing) return existing;
    const id = makeStepId(draft.rows);
    draft.rows[index] = { ...step, mergeId: id };
    return id;
  }

  /**
   * Point the selected `[goto: …]` row at the step at `stepIndex`, giving
   * that step an id if it has none — then sweep up the id the jump just
   * stopped using, so retargeting doesn't leave an orphan `id:` line on the
   * old destination.
   */
  function pickMergeTarget(stepIndex) {
    if (saveIndex < 0 || lockedRows.has(saveIndex)) return;
    commit((draft) => {
      const step = draft.rows[stepIndex];
      if (!step || step.kind !== "step" || step.empty) return;
      // Let go of the old target *before* naming the new one, so the sweep
      // frees that id and the fresh one can reuse it — otherwise every
      // retarget would ratchet the counter up and leave a hole behind.
      draft.rows[saveIndex] = { ...draft.rows[saveIndex], mergeTarget: "" };
      draft.rows = pruneUnreferencedStepIds(draft.rows);
      const id = ensureStepIdAt(draft, stepIndex);
      draft.rows[saveIndex] = { ...draft.rows[saveIndex], mergeTarget: id };
    });
  }

  function addLoop() {
    setDropOpen(false);
    const branchId = enclosingIfId(rows, selectedIndex);
    if (!branchId) return;
    commit((draft) => {
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : draft.rows.length;
      draft.rows.splice(insertAt, 0, { kind: "branchLoop", loopBranchId: branchId, depth: 0 });
    });
  }

  /**
   * Add a `[goto: id]` jump. Unlike `loop`, it has no bare spelling — it must
   * name a step from the moment it exists, or the document it serializes to
   * doesn't parse and the row vanishes on the next round trip. So pick a
   * sensible default here (the first step past the enclosing `end-if`, which
   * is what "jump ahead, skipping the rest of this decision" means, falling
   * back to the nearest step before the `if`) and name it if it has no id.
   */
  function addMerge() {
    setDropOpen(false);
    const branchId = enclosingIfId(rows, selectedIndex);
    if (!branchId) return;
    commit((draft) => {
      const startIdx = draft.rows.findIndex((r) => r.kind === "branchStart" && r.id === branchId);
      if (startIdx < 0) return;
      const endIdx = findBranchEndIndex(draft.rows, startIdx);
      let targetIdx = -1;
      if (endIdx >= 0) {
        for (let i = endIdx + 1; i < draft.rows.length; i++) {
          if (isStepRow(draft.rows[i])) {
            targetIdx = i;
            break;
          }
        }
      }
      if (targetIdx < 0) {
        for (let i = startIdx - 1; i >= 0; i--) {
          if (isStepRow(draft.rows[i])) {
            targetIdx = i;
            break;
          }
        }
      }
      // No step anywhere outside this if to land on — adding the jump would
      // only produce an unparseable line, so add nothing.
      if (targetIdx < 0) return;
      const mergeTarget = ensureStepIdAt(draft, targetIdx);
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : draft.rows.length;
      draft.rows.splice(insertAt, 0, {
        kind: "branchMerge",
        mergeTarget,
        mergeBranchId: branchId,
        depth: 0,
      });
    });
  }

  function openDrop() {
    const rect = chevronRef.current?.getBoundingClientRect();
    if (rect) setDropPos({ top: rect.bottom + 2, left: rect.left });
    setDropOpen(true);
  }

  useEffect(() => {
    if (!dropOpen) return;
    function close() {
      setDropOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [dropOpen]);

  const isStep = inspectorRow?.kind === "step" && !inspectorRow.empty;
  const reorder = isStep ? getReorderBounds(rows, saveIndex) : null;
  const isLocked = saveIndex >= 0 && lockedRows.has(saveIndex);

  // Wide: every pane is on screen, so every pane renders. Narrow: exactly one.
  // A hidden pane is not rendered rather than hidden with CSS, so its inputs
  // cannot be reached by tabbing into a column nobody can see.
  const showPane = (which) => !narrow || pane === which;

  // A brand-new file already seeds one step (see DEFAULT_TAB_TEMPLATE), so
  // zero rows here means the flow was emptied out (e.g. the last step was
  // deleted) rather than "never touched" — still exactly the moment a
  // starter shape is most useful, so offer the same gallery either way.
  // Picking "start blank" is just the normal add-step action: it makes
  // rows.length > 0, which is what hides this state, so no extra flag needed.
  if (!readOnly && rows.length === 0) {
    return (
      <div className="sw-gui-wrap">
        <StarterGallery
          title={t("starter.title")}
          hint={t("starter.hint")}
          onSelect={(dsl) => onChange(dsl)}
          onSkip={addStep}
          skipLabel={t("gui.addStep")}
        />
      </div>
    );
  }

  return (
    <div className="sw-gui-wrap">
      {errors?.length > 0 && (
        <div className="sw-gui-error-banner">
          <span>
            {lockedRows.size > 0
              ? t("errors.gutterBanner", { n: lockedRows.size })
              : t("errors.definitionsBanner")}
          </span>
          {onSwitchToText && (
            <button type="button" className="sw-btn sw-btn-sm" onClick={onSwitchToText}>
              {t("errors.fixInText")}
            </button>
          )}
        </div>
      )}
      <div className={narrow ? "sw-gui sw-gui-narrow" : "sw-gui"}>
        {showPane("flow") && (
          <div
            className="sw-gui-list-pane"
            style={narrow ? undefined : { width: stepList.width, flex: "0 0 auto" }}
          >
            <div className="sw-gui-list-head">
              <span>{t("gui.flow")}</span>
              <div className="sw-gui-list-actions">
                {!readOnly && (
                  <div className="sw-add-block-wrap">
                    <button
                      type="button"
                      className="sw-btn sw-btn-sm sw-add-block-main"
                      onClick={addStep}
                    >
                      <Plus size={13} /> {t("gui.addStep")}
                    </button>
                    <button
                      type="button"
                      ref={chevronRef}
                      className="sw-add-block-chevron"
                      title={t("gui.addBlock")}
                      onClick={(e) => {
                        e.stopPropagation();
                        openDrop();
                      }}
                    >
                      <ChevronDown size={12} />
                    </button>
                    {dropOpen &&
                      // Portaled to <body>: the menu is `position: fixed`, and
                      // inside a host page whose ancestors transform, clip or
                      // stack it would land off-screen or under something.
                      createPortal(
                        <div className="sw-editor sw-dialog-root">
                          <AddStepMenu
                            position={dropPos}
                            onClose={() => setDropOpen(false)}
                            onAddIf={addIfBranch}
                            onAddSwitch={addSwitch}
                            onAddFork={addFork}
                            onAddSection={addSection}
                            onAddBranch={addSubBranch}
                            onAddLoop={addLoop}
                            onAddMerge={addMerge}
                            canJump={enclosingIfId(rows, selectedIndex) != null}
                          />
                        </div>,
                        document.body,
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
        )}
        {!narrow && (
          <div
            className="sw-resizer"
            role="separator"
            aria-orientation="vertical"
            onMouseDown={stepList.startDrag}
            onTouchStart={stepList.startDrag}
          />
        )}
        {showPane("edit") && (
          <div
            className="sw-gui-inspector-pane"
            style={narrow ? undefined : { width: detail.width, flex: "0 0 auto" }}
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
                locked={isLocked}
                onPatch={patchRow}
                onMove={moveStep}
                onOpenMove={() => setShowMove(true)}
                onDelete={deleteRow}
                linkTargets={linkTargets}
                currentFileId={activeDocumentId}
              />
            ) : inspectorRow ? (
              <BranchInspector
                row={inspectorRow}
                rows={rows}
                readOnly={readOnly}
                locked={isLocked}
                onPatch={patchRow}
                onPickMergeTarget={pickMergeTarget}
                onDelete={deleteRow}
                onAddCase={
                  !readOnly &&
                  !isLocked &&
                  ["branchStart", "branchCase"].includes(inspectorRow?.kind)
                    ? addCaseToBranch
                    : undefined
                }
              />
            ) : (
              <div className="sw-gui-empty">{t("gui.selectRow")}</div>
            )}
          </div>
        )}
        {!narrow && (
          <div
            className="sw-resizer"
            role="separator"
            aria-orientation="vertical"
            onMouseDown={detail.startDrag}
            onTouchStart={detail.startDrag}
          />
        )}
        {showPane("preview") && (
          <div className="sw-gui-preview-pane sw-preview-pane">
            <PreviewPane
              svg={interactiveSvg ?? svg}
              hasErrors={errors?.length > 0}
              onRowClick={!readOnly ? setSelectedIndex : undefined}
              onLinkClick={onLinkClick}
            />
          </div>
        )}
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
