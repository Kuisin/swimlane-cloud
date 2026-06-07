import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, Undo2 } from "lucide-react";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { renderPartsPreviewHtml } from "@swimlane-cloud/diagram-converter";
import { THEMES } from "@swimlane-cloud/diagram-converter/themes";
import { applyModelEdit } from "../../lib/gui-model.js";
import { useT } from "../../i18n.jsx";

const SHAPES = ["rect", "rounded", "hex", "ellipse", "cloud", "note", "subroutine", "arrow-down"];

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

/** Read the kind's definitions out of a parsed model as a plain array. */
function readEntries(model, kind) {
  const list =
    kind === "role"
      ? model.lanes || []
      : Object.values((kind === "block" ? model.blocks : model.props) || {});
  return list.map((e) => ({ ...e }));
}

function uniqueId(entries, kind) {
  const ids = new Set(entries.map((e) => e.id));
  let n = entries.length + 1;
  while (ids.has(`${kind}${n}`)) n++;
  return `${kind}${n}`;
}

/** Minimal parts fragment for one block/prop so it can be previewed live. */
function entryPartsCode(kind, e) {
  const lines = [`/${kind}/`, `<${e.id}>`];
  const emit = (k, v) => {
    if (v != null && String(v) !== "") lines.push(`${k}: ${v};`);
  };
  emit("label", e.label);
  if (kind === "block") {
    emit("background-color", e.bg);
    emit("text-color", e.textColor);
    emit("border-color", e.borderColor);
    emit("shape", e.shape);
    emit("icon", e.icon);
  } else {
    emit("side", e.side);
    emit("background-color", e.bg);
    emit("border-color", e.borderColor);
    emit("text-color", e.textColor);
    emit("title", e.title);
    if (e.maxChars != null && e.maxChars !== "") emit("max-chars", String(e.maxChars));
  }
  return lines.join("\n");
}

function Preview({ kind, entry, theme }) {
  const html = useMemo(() => {
    if (kind === "role") return null;
    try {
      return renderPartsPreviewHtml(entryPartsCode(kind, entry), theme ?? THEMES.basic);
    } catch {
      return "";
    }
  }, [kind, entry, theme]);

  if (kind === "role") {
    return (
      <span
        className="sw-def-role-chip"
        style={{
          background: cssColor(entry.bg) === "transparent" ? "var(--sw-bg-sunken)" : cssColor(entry.bg),
          color: cssColor(entry.textColor) === "transparent" ? "var(--sw-text)" : cssColor(entry.textColor),
        }}
      >
        {entry.label || entry.id}
      </span>
    );
  }
  if (!html) return null;
  return <div className="sw-def-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * CRUD editor for `/role/`, `/block/`, `/prop/` definitions. Edits are buffered
 * locally with a live preview; **Save** commits them to the document (lossless,
 * via applyModelEdit) and **Revert** discards them back to the saved state.
 */
export function DefinitionsEditor({ kind, src, readOnly, onChange, theme }) {
  const { t } = useT();
  const saved = useMemo(() => readEntries(parseDSL(src), kind), [src, kind]);
  const [entries, setEntries] = useState(saved);
  // Re-sync to the document whenever the saved state changes (e.g. after Save,
  // or an external edit). While editing here, `src` doesn't change.
  useEffect(() => setEntries(saved), [saved]);

  const dirty = JSON.stringify(entries) !== JSON.stringify(saved);

  const setField = (id, key, value) =>
    setEntries((es) =>
      es.map((e) => {
        if (e.id !== id) return e;
        const next = { ...e };
        if (value === "" || value == null) delete next[key];
        else next[key] = key === "maxChars" ? Number(value) : value;
        return next;
      }),
    );
  const add = () =>
    setEntries((es) => [
      ...es,
      { id: uniqueId(es, kind), label: "", ...(kind === "prop" ? { side: "right" } : {}) },
    ]);
  const remove = (id) => setEntries((es) => es.filter((e) => e.id !== id));

  const revert = () => setEntries(saved);
  const save = () => {
    if (readOnly || !dirty) return;
    onChange(
      applyModelEdit(src, (draft) => {
        if (kind === "role") {
          draft.lanes = entries.map((e) => ({ ...e }));
        } else {
          const map = {};
          for (const e of entries) map[e.id] = { ...e };
          if (kind === "block") draft.blocks = map;
          else draft.props = map;
        }
      }),
    );
  };

  return (
    <div className="sw-defs">
      {entries.length === 0 && <div className="sw-gui-empty">{t("defs.empty")}</div>}
      {entries.map((e) => (
        <div key={e.id} className="sw-def-card">
          <div className="sw-def-head">
            <code className="sw-def-id">&lt;{e.id}&gt;</code>
            <Preview kind={kind} entry={e} theme={theme} />
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
        <div className="sw-defs-bar">
          <button type="button" className="sw-btn sw-btn-sm" onClick={add}>
            <Plus size={13} /> {t("defs.add")}
          </button>
          <span className="sw-defs-bar-spacer" />
          <button type="button" className="sw-btn sw-btn-sm" disabled={!dirty} onClick={revert}>
            <Undo2 size={13} /> {t("defs.revert")}
          </button>
          <button
            type="button"
            className="sw-btn sw-btn-sm sw-btn-accent"
            disabled={!dirty}
            onClick={save}
          >
            <Check size={13} /> {t("defs.save")}
          </button>
        </div>
      )}
    </div>
  );
}
