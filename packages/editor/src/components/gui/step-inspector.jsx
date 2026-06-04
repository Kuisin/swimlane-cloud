import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

const ARROW_OPTIONS = [
  { value: "solid", label: "solid" },
  { value: "dashed", label: "dashed" },
  { value: "none", label: "none" },
];

/**
 * Inspector for a single step row. Edits role / text / label / desc / remark /
 * block ref / props / merge id / arrow style, plus move up/down and delete.
 * All edits go through `onPatch` which mutates the parsed model row.
 */
export function StepInspector({
  row,
  lanes,
  blocks,
  props,
  reorder,
  onPatch,
  onMove,
  onDelete,
  readOnly,
}) {
  if (!row || row.kind !== "step" || row.empty) {
    return <div className="sw-gui-empty">Select a step to edit it.</div>;
  }
  const set = (key) => (value) => onPatch({ [key]: value });
  const fieldDisabled = readOnly;

  const selectedProps = new Set(row.props || []);
  const toggleProp = (id) => {
    const next = new Set(selectedProps);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onPatch({ props: [...next] });
  };

  return (
    <div className="sw-inspector">
      <div className="sw-inspector-head">
        <h3>Step</h3>
        <div className="sw-inspector-tools">
          <button
            type="button"
            className="sw-icon-btn"
            disabled={fieldDisabled || !reorder?.canUp}
            onClick={() => onMove("up")}
            title="Move up"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className="sw-icon-btn"
            disabled={fieldDisabled || !reorder?.canDown}
            onClick={() => onMove("down")}
            title="Move down"
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            className="sw-icon-btn sw-icon-danger"
            disabled={fieldDisabled}
            onClick={onDelete}
            title="Delete step"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <label className="sw-field">
        <span className="sw-field-label">Role (lane)</span>
        <select
          className="sw-input"
          value={row.role || ""}
          disabled={fieldDisabled}
          onChange={(e) => set("role")(e.target.value)}
        >
          {!row.role && <option value="">(choose a role)</option>}
          {(lanes || []).map((lane) => (
            <option key={lane.id} value={lane.id}>
              {lane.label || lane.id}
            </option>
          ))}
        </select>
      </label>

      <label className="sw-field">
        <span className="sw-field-label">Text</span>
        <input
          type="text"
          className="sw-input"
          value={row.text || ""}
          disabled={fieldDisabled}
          onChange={(e) => set("text")(e.target.value)}
        />
      </label>

      <label className="sw-field">
        <span className="sw-field-label">Label (optional)</span>
        <input
          type="text"
          className="sw-input"
          value={row.name || ""}
          disabled={fieldDisabled}
          onChange={(e) => set("name")(e.target.value || "")}
        />
      </label>

      <label className="sw-field">
        <span className="sw-field-label">Description</span>
        <textarea
          className="sw-input sw-textarea-sm"
          rows={2}
          value={row.description || ""}
          disabled={fieldDisabled}
          onChange={(e) => set("description")(e.target.value || "")}
        />
      </label>

      <label className="sw-field">
        <span className="sw-field-label">Remark</span>
        <textarea
          className="sw-input sw-textarea-sm"
          rows={2}
          value={row.remark || ""}
          disabled={fieldDisabled}
          onChange={(e) => set("remark")(e.target.value || "")}
        />
      </label>

      <div className="sw-field-row">
        <label className="sw-field">
          <span className="sw-field-label">Block style</span>
          <select
            className="sw-input"
            value={row.blockRef || ""}
            disabled={fieldDisabled}
            onChange={(e) => set("blockRef")(e.target.value || null)}
          >
            <option value="">(none)</option>
            {Object.values(blocks || {}).map((b) => (
              <option key={b.id} value={b.id}>
                {b.label || b.id}
              </option>
            ))}
          </select>
        </label>
        <label className="sw-field">
          <span className="sw-field-label">Arrow</span>
          <select
            className="sw-input"
            value={row.arrowLine || "solid"}
            disabled={fieldDisabled}
            onChange={(e) => set("arrowLine")(e.target.value)}
          >
            {ARROW_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="sw-field">
        <span className="sw-field-label">Merge id (optional)</span>
        <input
          type="text"
          className="sw-input"
          value={row.mergeId || ""}
          disabled={fieldDisabled}
          onChange={(e) => set("mergeId")(e.target.value || "")}
        />
      </label>

      {Object.values(props || {}).length > 0 && (
        <div className="sw-field">
          <span className="sw-field-label">Props</span>
          <div className="sw-prop-chips">
            {Object.values(props).map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={fieldDisabled}
                className={`sw-chip ${selectedProps.has(p.id) ? "sw-chip-on" : ""}`}
                onClick={() => toggleProp(p.id)}
              >
                {p.label || p.id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
