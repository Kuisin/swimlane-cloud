import { Trash2 } from "lucide-react";

const BRANCH_COLORS = ["", "blue", "green", "red", "orange", "purple", "gray", "black"];

/** Inspector for branch/case/group rows (condition, case label, accent color). */
export function BranchInspector({ row, onPatch, onDelete, readOnly }) {
  if (!row) return <div className="sw-gui-empty">Select a row to edit it.</div>;

  const isStart = row.kind === "branchStart";
  const isCase = row.kind === "branchCase";
  const isGroup = row.kind === "groupStart";

  return (
    <div className="sw-inspector">
      <div className="sw-inspector-head">
        <h3>
          {isStart && (row.parallel ? "Parallel (fork)" : "Branch (if)")}
          {isCase && (row.parallel ? "Parallel path" : "Case")}
          {isGroup && (row.groupMode === "section" ? "Section" : "Sub-branch")}
          {!isStart && !isCase && !isGroup && "Row"}
        </h3>
        {!readOnly && onDelete && (
          <button type="button" className="sw-icon-btn sw-icon-danger" onClick={onDelete} title="Delete">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {isStart && !row.parallel && (
        <label className="sw-field">
          <span className="sw-field-label">Condition</span>
          <input
            type="text"
            className="sw-input"
            value={row.cond || ""}
            disabled={readOnly}
            onChange={(e) => onPatch({ cond: e.target.value })}
          />
        </label>
      )}

      {isCase && !row.parallel && !/^else$/i.test((row.label || "").trim()) && (
        <label className="sw-field">
          <span className="sw-field-label">Case label</span>
          <input
            type="text"
            className="sw-input"
            value={row.label || ""}
            disabled={readOnly}
            onChange={(e) => onPatch({ label: e.target.value })}
          />
        </label>
      )}

      {isGroup && (
        <label className="sw-field">
          <span className="sw-field-label">Name</span>
          <input
            type="text"
            className="sw-input"
            value={row.sectionName || ""}
            disabled={readOnly}
            onChange={(e) => onPatch({ sectionName: e.target.value })}
          />
        </label>
      )}

      {(isStart || isCase || isGroup) && (
        <label className="sw-field">
          <span className="sw-field-label">Accent color</span>
          <select
            className="sw-input"
            value={(isGroup ? row.sectionColor : row.branchColor) || ""}
            disabled={readOnly}
            onChange={(e) =>
              onPatch(isGroup ? { sectionColor: e.target.value || null } : { branchColor: e.target.value || null })
            }
          >
            {BRANCH_COLORS.map((c) => (
              <option key={c} value={c}>
                {c || "(default)"}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
