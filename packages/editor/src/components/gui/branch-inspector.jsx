import { Plus, Trash2 } from "lucide-react";
import { useT } from "../../i18n.jsx";
import { collectMergeTargetOptions } from "../../lib/flow-rows.js";
import { BranchColorField } from "./branch-color-field.jsx";

/** Inspector for branch/case/group/merge rows (condition, case label, accent color, merge target). */
export function BranchInspector({ row, rows, onPatch, onDelete, onAddCase, readOnly }) {
  const { t } = useT();
  if (!row) return <div className="sw-gui-empty">{t("gui.selectRow")}</div>;

  const isStart = row.kind === "branchStart";
  const isCase = row.kind === "branchCase";
  const isGroup = row.kind === "groupStart";
  const isMerge = row.kind === "branchMerge";
  const canAddCase = (isStart || isCase) && !isGroup;
  const addCaseLabel = row.parallel ? t("branch.addPath") : t("branch.addCase");
  const mergeTargets = isMerge
    ? collectMergeTargetOptions(rows || []).filter((o) => o.mergeId)
    : [];

  return (
    <div className="sw-inspector">
      <div className="sw-inspector-head">
        <h3>
          {isStart && (row.parallel ? t("branch.fork") : t("branch.if"))}
          {isCase && (row.parallel ? t("branch.parallelPath") : t("branch.case"))}
          {isGroup && (row.groupMode === "section" ? t("branch.section") : t("branch.subbranch"))}
          {isMerge && t("branch.merge")}
          {!isStart && !isCase && !isGroup && !isMerge && t("branch.row")}
        </h3>
        <div className="sw-inspector-tools">
          {!readOnly && canAddCase && onAddCase && (
            <button
              type="button"
              className="sw-btn sw-btn-sm"
              onClick={onAddCase}
              title={addCaseLabel}
            >
              <Plus size={12} /> {addCaseLabel}
            </button>
          )}
          {!readOnly && onDelete && (
            <button
              type="button"
              className="sw-icon-btn sw-icon-danger"
              onClick={onDelete}
              title={t("common.delete")}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {isStart && !row.parallel && (
        <label className="sw-field">
          <span className="sw-field-label">{t("branch.condition")}</span>
          <input
            type="text"
            className="sw-input"
            value={row.cond || ""}
            disabled={readOnly}
            onChange={(e) => onPatch({ cond: e.target.value })}
          />
        </label>
      )}

      {isCase && !row.parallel && (
        <label className="sw-field">
          <span className="sw-field-label">{t("branch.caseLabel")}</span>
          <input
            type="text"
            className="sw-input"
            value={row.label || ""}
            disabled={readOnly}
            placeholder={t("branch.elsePlaceholder")}
            onChange={(e) => onPatch({ label: e.target.value })}
          />
        </label>
      )}

      {isGroup && (
        <label className="sw-field">
          <span className="sw-field-label">{t("branch.name")}</span>
          <input
            type="text"
            className="sw-input"
            value={row.sectionName || ""}
            disabled={readOnly}
            onChange={(e) => onPatch({ sectionName: e.target.value })}
          />
        </label>
      )}

      {isMerge && (
        <label className="sw-field">
          <span className="sw-field-label">{t("branch.mergeTarget")}</span>
          {mergeTargets.length === 0 ? (
            <p className="sw-field-hint">{t("branch.mergeTargetEmpty")}</p>
          ) : (
            <select
              className="sw-input"
              value={row.mergeTarget || ""}
              disabled={readOnly}
              onChange={(e) => onPatch({ mergeTarget: e.target.value || "" })}
            >
              <option value="">{t("branch.mergeTargetChoose")}</option>
              {mergeTargets.map((opt) => (
                <option key={opt.stepIndex} value={opt.mergeId}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          <p className="sw-field-hint">{t("branch.mergeTargetHint")}</p>
        </label>
      )}

      {(isStart || isCase || isGroup) && (
        <label className="sw-field">
          <span className="sw-field-label">{t("branch.accent")}</span>
          <BranchColorField
            value={(isGroup ? row.sectionColor : row.branchColor) || null}
            disabled={readOnly}
            onChange={(next) => onPatch(isGroup ? { sectionColor: next } : { branchColor: next })}
          />
        </label>
      )}
    </div>
  );
}
