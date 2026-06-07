import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { applyModelEdit } from "../../lib/gui-model.js";
import { useT } from "../../i18n.jsx";

const SHAPES = ["rect", "rounded", "hex", "ellipse", "cloud", "note", "subroutine", "arrow-down"];

// Editable fields per definition kind (must match serializeRole/Block/Prop).
const FIELDS = {
  role: [
    { key: "label", type: "text" },
    { key: "bg", type: "color" },
    { key: "textColor", type: "color" },
    { key: "icon", type: "text", ph: "#user" },
  ],
  block: [
    { key: "label", type: "text" },
    { key: "shape", type: "select", options: SHAPES },
    { key: "bg", type: "color" },
    { key: "textColor", type: "color" },
    { key: "borderColor", type: "color" },
    { key: "icon", type: "text", ph: "#settings" },
  ],
  prop: [
    { key: "label", type: "text" },
    { key: "side", type: "select", options: ["left", "right"] },
    { key: "bg", type: "color" },
    { key: "borderColor", type: "color" },
    { key: "textColor", type: "color" },
    { key: "title", type: "text" },
    { key: "maxChars", type: "number" },
  ],
};

const cssColor = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return "transparent";
  return /^[0-9a-fA-F]{3,8}$/.test(s) ? `#${s}` : s;
};

/** Get the live entry object for `id` from a parsed draft. */
function pick(draft, kind, id) {
  if (kind === "role") return (draft.lanes || []).find((l) => l.id === id);
  return (kind === "block" ? draft.blocks : draft.props)?.[id];
}

function uniqueId(model, kind) {
  const ids = new Set(
    kind === "role"
      ? (model.lanes || []).map((l) => l.id)
      : Object.keys((kind === "block" ? model.blocks : model.props) || {}),
  );
  let n = ids.size + 1;
  while (ids.has(`${kind}${n}`)) n++;
  return `${kind}${n}`;
}

/**
 * CRUD editor for `/role/`, `/block/` and `/prop/` definitions, edited as the
 * parsed model and written back through `applyModelEdit` (lossless round-trip).
 */
export function DefinitionsEditor({ kind, src, readOnly, onChange }) {
  const { t } = useT();
  const model = useMemo(() => {
    try {
      return parseDSL(src);
    } catch {
      return null;
    }
  }, [src]);
  if (!model) return null;

  const entries =
    kind === "role"
      ? model.lanes || []
      : Object.values((kind === "block" ? model.blocks : model.props) || {});

  const edit = (mut) => {
    if (!readOnly) onChange(applyModelEdit(src, mut));
  };
  const setField = (id, key, value) =>
    edit((draft) => {
      const e = pick(draft, kind, id);
      if (e) {
        if (value === "" || value == null) delete e[key];
        else e[key] = key === "maxChars" ? Number(value) : value;
      }
    });
  const add = () =>
    edit((draft) => {
      const id = uniqueId(draft, kind);
      if (kind === "role") (draft.lanes ||= []).push({ id, label: id });
      else {
        const coll = kind === "block" ? (draft.blocks ||= {}) : (draft.props ||= {});
        coll[id] = { id, label: id, ...(kind === "prop" ? { side: "right" } : {}) };
      }
    });
  const remove = (id) =>
    edit((draft) => {
      if (kind === "role") draft.lanes = (draft.lanes || []).filter((l) => l.id !== id);
      else delete (kind === "block" ? draft.blocks : draft.props)?.[id];
    });

  return (
    <div className="sw-defs">
      {entries.length === 0 && <div className="sw-gui-empty">{t("defs.empty")}</div>}
      {entries.map((e) => (
        <div key={e.id} className="sw-def-card">
          <div className="sw-def-head">
            <code className="sw-def-id">&lt;{e.id}&gt;</code>
            {!readOnly && (
              <button
                type="button"
                className="sw-icon-btn sw-icon-danger"
                onClick={() => remove(e.id)}
                title={t("defs.delete")}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <div className="sw-def-fields">
            {FIELDS[kind].map((f) => (
              <label key={f.key} className="sw-field">
                <span className="sw-field-label">{t(`defs.field.${f.key}`)}</span>
                {f.type === "select" ? (
                  <select
                    className="sw-input"
                    value={e[f.key] || ""}
                    disabled={readOnly}
                    onChange={(ev) => setField(e.id, f.key, ev.target.value)}
                  >
                    <option value="">—</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.type === "color" ? (
                  <span className="sw-def-color">
                    <span className="sw-def-swatch" style={{ background: cssColor(e[f.key]) }} />
                    <input
                      type="text"
                      className="sw-input"
                      value={e[f.key] || ""}
                      placeholder="#dbeafe / blue"
                      disabled={readOnly}
                      onChange={(ev) => setField(e.id, f.key, ev.target.value)}
                    />
                  </span>
                ) : (
                  <input
                    type={f.type === "number" ? "number" : "text"}
                    className="sw-input"
                    value={e[f.key] ?? ""}
                    placeholder={f.ph || ""}
                    disabled={readOnly}
                    onChange={(ev) => setField(e.id, f.key, ev.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      ))}
      {!readOnly && (
        <button type="button" className="sw-btn sw-btn-sm" onClick={add}>
          <Plus size={13} /> {t("defs.add")}
        </button>
      )}
    </div>
  );
}
