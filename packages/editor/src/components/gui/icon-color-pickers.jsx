import { createElement, useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { LUCIDE_ICON_NODES, getLucideIconNode } from "@swimlane-cloud/diagram-converter";
import { useT } from "../../i18n.jsx";

const ICON_NAMES = Object.keys(LUCIDE_ICON_NODES);

/** Preset color palette shown in the color picker (light fills + saturated). */
const COLOR_PALETTE = [
  "#ffffff", "#f8fafc", "#f1f5f9", "#e2e8f0", "#94a3b8", "#475569", "#1e293b", "#000000",
  "#fee2e2", "#fecaca", "#ef4444", "#b91c1c",
  "#ffedd5", "#fed7aa", "#f97316", "#c2410c",
  "#fef9c3", "#fde68a", "#eab308", "#a16207",
  "#dcfce7", "#bbf7d0", "#22c55e", "#15803d",
  "#dbeafe", "#bfdbfe", "#3b82f6", "#1d4ed8",
  "#e0e7ff", "#c7d2fe", "#6366f1", "#4338ca",
  "#f3e8ff", "#e9d5ff", "#a855f7", "#7e22ce",
];

const cssColor = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return "transparent";
  return /^[0-9a-fA-F]{3,8}$/.test(s) ? `#${s}` : s;
};

/** Render a Lucide icon (by DSL name, with or without a leading `#`) as inline SVG. */
export function IconGlyph({ name, size = 16 }) {
  const node = getLucideIconNode(String(name ?? "").replace(/^#/, "").trim());
  if (!node) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {node.map(([tag, attrs], i) => {
        const { key, ...rest } = attrs;
        return createElement(tag, { key: key ?? i, ...rest });
      })}
    </svg>
  );
}

/** Close a popover when clicking outside it or pressing Escape. */
function useDismiss(ref, onClose) {
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [ref, onClose]);
}

/**
 * Icon selector — a trigger showing the current icon, opening a searchable grid
 * of every available icon. Stores the value as `#name` (the DSL form).
 */
export function IconField({ value, onChange, readOnly, placeholder }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef(null);
  useDismiss(wrapRef, () => setOpen(false));

  const current = String(value ?? "").replace(/^#/, "").trim();
  const filtered = q.trim()
    ? ICON_NAMES.filter((n) => n.includes(q.trim().toLowerCase()))
    : ICON_NAMES;

  return (
    <span className="sw-picker" ref={wrapRef}>
      <button
        type="button"
        className="sw-input sw-picker-trigger"
        disabled={readOnly}
        onClick={() => setOpen((o) => !o)}
      >
        {current ? (
          <>
            <IconGlyph name={current} size={15} />
            <span className="sw-picker-trigger-label">{current}</span>
          </>
        ) : (
          <span className="sw-picker-trigger-label sw-picker-muted">
            {placeholder || t("defs.pick.icon")}
          </span>
        )}
        <ChevronDown size={13} className="sw-picker-caret" />
      </button>
      {open && !readOnly && (
        <div className="sw-popover sw-icon-popover">
          <div className="sw-popover-head">
            <input
              type="text"
              className="sw-input"
              autoFocus
              placeholder={t("defs.pick.search")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {current && (
              <button
                type="button"
                className="sw-icon-btn"
                title={t("defs.pick.clear")}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="sw-icon-grid">
            {filtered.map((n) => (
              <button
                type="button"
                key={n}
                className={`sw-icon-cell${n === current ? " sw-icon-cell-active" : ""}`}
                title={n}
                onClick={() => {
                  onChange(`#${n}`);
                  setOpen(false);
                }}
              >
                <IconGlyph name={n} size={18} />
              </button>
            ))}
            {filtered.length === 0 && <div className="sw-picker-empty">{t("defs.pick.none")}</div>}
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * Color selector — a swatch + text input (named or hex) plus a palette popover
 * and a native picker for arbitrary hues.
 */
export function ColorField({ value, onChange, readOnly }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useDismiss(wrapRef, () => setOpen(false));

  const resolved = cssColor(value);
  const nativeHex = /^#?[0-9a-fA-F]{6}$/.test(String(value ?? "").trim())
    ? (String(value).startsWith("#") ? value : `#${value}`)
    : "#ffffff";

  return (
    <span className="sw-picker sw-def-color" ref={wrapRef}>
      <button
        type="button"
        className="sw-def-swatch sw-def-swatch-btn"
        style={{ background: resolved }}
        disabled={readOnly}
        title={t("defs.pick.color")}
        onClick={() => setOpen((o) => !o)}
      />
      <input
        type="text"
        className="sw-input"
        value={value || ""}
        placeholder="#dbeafe / blue"
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
      {open && !readOnly && (
        <div className="sw-popover sw-color-popover">
          <div className="sw-color-grid">
            {COLOR_PALETTE.map((c) => (
              <button
                type="button"
                key={c}
                className={`sw-color-cell${cssColor(value).toLowerCase() === c ? " sw-color-cell-active" : ""}`}
                style={{ background: c }}
                title={c}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <div className="sw-color-popover-foot">
            <label className="sw-color-native">
              <input
                type="color"
                value={nativeHex}
                onChange={(e) => onChange(e.target.value)}
              />
              <span>{t("defs.pick.custom")}</span>
            </label>
            <button
              type="button"
              className="sw-icon-btn"
              title={t("defs.pick.clear")}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
