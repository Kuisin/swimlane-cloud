import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  GitBranch,
  HelpCircle,
  LayoutTemplate,
  Save,
  SaveAll,
  Tag,
  Wand2,
} from "lucide-react";
import { useT } from "../i18n.jsx";

/**
 * Top action bar. Save / Save all / New file / New folder / Export / Templates
 * / Help are always shown when the host supports them; Checkpoint / Flag new
 * version are gated on host capability + method presence.
 *
 * `onExport(format)` is called with "txt", "svg", "png", or "png-hd"
 * (PNG at a higher pixel scale for print/zoom).
 * `shortcuts` is an optional object with keys like `save`, `saveAll`, `format`
 * whose values are shortcut label strings (e.g. "⌘S") appended to tooltips.
 */
export function ActionBar({
  counts,
  mode,
  hasUnsavedChanges,
  hasAnyUnsavedChanges,
  readOnly,
  canCreate,
  canMkdir,
  canFormat,
  canCheckpoint,
  canVersion,
  hasSvg,
  shortcuts,
  onSave,
  onSaveAll,
  onNewFile,
  onNewFolder,
  onExport,
  onFormat,
  onOpenTemplates,
  onOpenHelp,
  onCheckpoint,
  onFlagVersion,
}) {
  const { t } = useT();
  const sc = shortcuts || {};
  const withShortcut = (label, key) => (key ? `${label} (${key})` : label);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMenuPos, setExportMenuPos] = useState(null);
  const exportRef = useRef(null);

  useEffect(() => {
    if (!exportOpen) return;
    function handleClick(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [exportOpen]);

  function handleExportToggle() {
    if (!exportOpen && exportRef.current) {
      const rect = exportRef.current.getBoundingClientRect();
      setExportMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setExportOpen((v) => !v);
  }

  return (
    <div className="sw-actionbar">
      <div className="sw-actionbar-left">
        <button type="button" className="sw-btn" onClick={onOpenTemplates}>
          <LayoutTemplate size={14} /> {t("action.templates")}
        </button>
        {mode === "text" && canFormat && (
          <button type="button" className="sw-btn" onClick={onFormat} title={withShortcut(t("action.format"), sc.format)}>
            <Wand2 size={14} /> {t("action.format")}
          </button>
        )}
      </div>

      <div className="sw-actionbar-counts">
        <span>{t("counts.roles", { n: counts.roles })}</span>
        <span className="sw-dot-sep">·</span>
        <span>{t("counts.blocks", { n: counts.blocks })}</span>
        <span className="sw-dot-sep">·</span>
        <span>{t("counts.steps", { n: counts.steps })}</span>
      </div>

      <div className="sw-actionbar-right">
        <div className="sw-export-wrap" ref={exportRef}>
          <button
            type="button"
            className="sw-btn sw-export-toggle"
            onClick={handleExportToggle}
          >
            <Download size={14} /> {t("action.export")} <ChevronDown size={12} />
          </button>
          {exportOpen && exportMenuPos && (
            <div className="sw-export-menu" style={{ position: "fixed", top: exportMenuPos.top, right: exportMenuPos.right }}>
              <button
                type="button"
                className="sw-export-item"
                onClick={() => { onExport("txt"); setExportOpen(false); }}
              >
                {t("action.exportTxt")}
              </button>
              <button
                type="button"
                className="sw-export-item"
                disabled={!hasSvg}
                onClick={() => { onExport("svg"); setExportOpen(false); }}
              >
                {t("action.exportSvg")}
              </button>
              <button
                type="button"
                className="sw-export-item"
                disabled={!hasSvg}
                onClick={() => { onExport("png"); setExportOpen(false); }}
              >
                {t("action.exportPng")}
              </button>
              <button
                type="button"
                className="sw-export-item"
                disabled={!hasSvg}
                onClick={() => { onExport("png-hd"); setExportOpen(false); }}
              >
                {t("action.exportPngHd")}
              </button>
            </div>
          )}
        </div>
        <button type="button" className="sw-icon-btn" onClick={onOpenHelp} title={withShortcut(t("action.help"), sc.help)}>
          <HelpCircle size={16} />
        </button>
        {canVersion && (
          <button type="button" className="sw-btn" onClick={onFlagVersion} title={t("action.versionTitle")}>
            <Tag size={14} /> {t("action.version")}
          </button>
        )}
        {canCheckpoint && (
          <button
            type="button"
            className="sw-btn"
            onClick={onCheckpoint}
            disabled={!hasAnyUnsavedChanges}
            title={t("action.checkpoint")}
          >
            <GitBranch size={14} /> {t("action.checkpoint")}
          </button>
        )}
        {!readOnly && (
          <>
            <button
              type="button"
              className="sw-btn"
              onClick={onSaveAll}
              disabled={!hasAnyUnsavedChanges}
              title={withShortcut(t("action.saveAll"), sc.saveAll)}
            >
              <SaveAll size={14} /> {t("action.saveAll")}
            </button>
            <button
              type="button"
              className={`sw-btn ${hasUnsavedChanges ? "sw-btn-accent" : ""}`}
              onClick={onSave}
              disabled={!hasUnsavedChanges}
              title={withShortcut(hasUnsavedChanges ? t("action.saveDirty") : t("action.save"), sc.save)}
            >
              <Save size={14} /> {hasUnsavedChanges ? t("action.saveDirty") : t("action.save")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
