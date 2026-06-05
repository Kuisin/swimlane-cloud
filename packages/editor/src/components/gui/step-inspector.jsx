import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, ListOrdered, Trash2 } from "lucide-react";
import { useT } from "../../i18n.jsx";
import { PartsPreviewPopup } from "./parts-preview-popup.jsx";

/**
 * Inspector for a single step row. Edits role / text / label / desc / remark /
 * block ref / props / merge id / arrow style, plus move up/down and delete.
 * All edits go through `onPatch` which mutates the parsed model row. The block
 * and prop pickers each gain an eye button that opens a design preview popup
 * (the dropdown / chips stay the primary way to pick).
 */
export function StepInspector({
  row,
  lanes,
  blocks,
  props,
  src,
  theme,
  reorder,
  onPatch,
  onMove,
  onOpenMove,
  onDelete,
  readOnly,
}) {
  const { t } = useT();
  const [preview, setPreview] = useState(null); // "block" | "prop" | null

  if (!row || row.kind !== "step" || row.empty) {
    return <div className="sw-gui-empty">{t("gui.selectStep")}</div>;
  }
  const set = (key) => (value) => onPatch({ [key]: value });
  const fieldDisabled = readOnly;

  const ARROW_OPTIONS = [
    { value: "solid", label: t("arrow.solid") },
    { value: "dashed", label: t("arrow.dashed") },
    { value: "none", label: t("arrow.none") },
  ];

  const selectedProps = new Set(row.props || []);
  const toggleProp = (id) => {
    const next = new Set(selectedProps);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onPatch({ props: [...next] });
  };

  const hasBlocks = Object.values(blocks || {}).length > 0;
  const propList = Object.values(props || {});

  return (
    <div className="sw-inspector">
      <div className="sw-inspector-head">
        <h3>{t("step.title")}</h3>
        <div className="sw-inspector-tools">
          <button
            type="button"
            className="sw-icon-btn"
            disabled={fieldDisabled || !reorder?.canUp}
            onClick={() => onMove("up")}
            title={t("step.moveUp")}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className="sw-icon-btn"
            disabled={fieldDisabled || !reorder?.canDown}
            onClick={() => onMove("down")}
            title={t("step.moveDown")}
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            className="sw-icon-btn"
            disabled={fieldDisabled || (!reorder?.canUp && !reorder?.canDown)}
            onClick={onOpenMove}
            title={t("step.moveTo")}
          >
            <ListOrdered size={14} />
          </button>
          <button
            type="button"
            className="sw-icon-btn sw-icon-danger"
            disabled={fieldDisabled}
            onClick={onDelete}
            title={t("step.delete")}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <label className="sw-field">
        <span className="sw-field-label">{t("step.role")}</span>
        <select
          className="sw-input"
          value={row.role || ""}
          disabled={fieldDisabled}
          onChange={(e) => set("role")(e.target.value)}
        >
          {!row.role && <option value="">{t("step.chooseRole")}</option>}
          {(lanes || []).map((lane) => (
            <option key={lane.id} value={lane.id}>
              {lane.label || lane.id}
            </option>
          ))}
        </select>
      </label>

      <label className="sw-field">
        <span className="sw-field-label">{t("step.text")}</span>
        <input
          type="text"
          className="sw-input"
          value={row.text || ""}
          disabled={fieldDisabled}
          onChange={(e) => set("text")(e.target.value)}
        />
      </label>

      <label className="sw-field">
        <span className="sw-field-label">{t("step.label")}</span>
        <input
          type="text"
          className="sw-input"
          value={row.name || ""}
          disabled={fieldDisabled}
          onChange={(e) => set("name")(e.target.value || "")}
        />
      </label>

      <label className="sw-field">
        <span className="sw-field-label">{t("step.description")}</span>
        <textarea
          className="sw-input sw-textarea-sm"
          rows={2}
          value={row.description || ""}
          disabled={fieldDisabled}
          onChange={(e) => set("description")(e.target.value || "")}
        />
      </label>

      <label className="sw-field">
        <span className="sw-field-label">{t("step.remark")}</span>
        <textarea
          className="sw-input sw-textarea-sm"
          rows={2}
          value={row.remark || ""}
          disabled={fieldDisabled}
          onChange={(e) => set("remark")(e.target.value || "")}
        />
      </label>

      <div className="sw-field-row">
        <div className="sw-field">
          <span className="sw-field-label">{t("step.block")}</span>
          <div className="sw-field-with-action">
            <select
              className="sw-input"
              value={row.blockRef || ""}
              disabled={fieldDisabled}
              onChange={(e) => set("blockRef")(e.target.value || null)}
            >
              <option value="">{t("step.none")}</option>
              {Object.values(blocks || {}).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label || b.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="sw-icon-btn"
              disabled={!hasBlocks}
              title={t("step.viewDesign")}
              onClick={() => setPreview("block")}
            >
              <Eye size={14} />
            </button>
          </div>
        </div>
        <label className="sw-field">
          <span className="sw-field-label">{t("step.arrow")}</span>
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
        <span className="sw-field-label">{t("step.mergeId")}</span>
        <input
          type="text"
          className="sw-input"
          value={row.mergeId || ""}
          disabled={fieldDisabled}
          onChange={(e) => set("mergeId")(e.target.value || "")}
        />
      </label>

      {propList.length > 0 && (
        <div className="sw-field">
          <span className="sw-field-label sw-field-label-row">
            {t("step.props")}
            <button
              type="button"
              className="sw-icon-btn sw-icon-btn-xs"
              title={t("step.viewDesign")}
              onClick={() => setPreview("prop")}
            >
              <Eye size={13} />
            </button>
          </span>
          <div className="sw-prop-chips">
            {propList.map((p) => (
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

      <PartsPreviewPopup
        open={preview === "block"}
        section="block"
        src={src}
        theme={theme}
        selectedId={row.blockRef || null}
        onClose={() => setPreview(null)}
        onSelect={(id) => {
          set("blockRef")(id || null);
          setPreview(null);
        }}
      />
      <PartsPreviewPopup
        open={preview === "prop"}
        section="prop"
        src={src}
        theme={theme}
        selectedId={(row.props || [])[0] || null}
        onClose={() => setPreview(null)}
        onSelect={(id) => {
          toggleProp(id);
          setPreview(null);
        }}
      />
    </div>
  );
}
