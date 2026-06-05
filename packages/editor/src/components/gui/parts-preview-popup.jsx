import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { renderPartsPreviewHtml } from "@swimlane-cloud/diagram-converter";
import { extractPartsCode, extractDefIds } from "../../lib/parts-extract.js";
import { useT } from "../../i18n.jsx";

/**
 * Design preview popup for the step inspector's block / prop pickers.
 * Shows each definition as a clickable item. Clicking calls `onSelect(id)`.
 * Pass `onSelect` to allow picking directly from the visual preview;
 * pass null to keep it view-only.
 */
export function PartsPreviewPopup({ open, section, src, theme, selectedId, onClose, onSelect }) {
  const { t } = useT();
  const [showAll, setShowAll] = useState(!selectedId);

  const ids = useMemo(() => {
    if (!open) return [];
    return extractDefIds(src, section);
  }, [open, src, section]);

  const visibleIds = useMemo(() => {
    if (showAll || !selectedId) return ids;
    return ids.filter((id) => id === selectedId);
  }, [ids, showAll, selectedId]);

  if (!open) return null;

  const title = section === "block" ? t("parts.blockTitle") : t("parts.propTitle");

  return (
    <div className="sw-modal-overlay" onClick={onClose}>
      <div className="sw-modal sw-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="sw-modal-header">
          <h2>{title}</h2>
          <button type="button" className="sw-icon-btn" onClick={onClose} title={t("tab.close")}>
            <X size={16} />
          </button>
        </div>
        <div className="sw-parts-popup-bar">
          {selectedId ? (
            <span className="sw-parts-selected">{t("parts.selected", { id: selectedId })}</span>
          ) : (
            <span />
          )}
          {ids.length > 1 && selectedId && (
            <button
              type="button"
              className="sw-btn sw-btn-sm"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? t("parts.showSelected") : t("parts.showAll")}
            </button>
          )}
        </div>
        <div className="sw-modal-body">
          {visibleIds.length === 0 ? (
            <div className="sw-gui-empty">{t("parts.none")}</div>
          ) : (
            <div className="sw-parts-grid">
              {visibleIds.map((id) => (
                <PartItem
                  key={id}
                  id={id}
                  section={section}
                  src={src}
                  theme={theme}
                  selected={id === selectedId}
                  canSelect={Boolean(onSelect)}
                  onSelect={onSelect ? () => { onSelect(id); onClose(); } : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PartItem({ id, section, src, theme, selected, canSelect, onSelect }) {
  const html = useMemo(() => {
    const code = extractPartsCode(src, section, id);
    if (!code) return "";
    try {
      return renderPartsPreviewHtml(code, theme);
    } catch {
      return "";
    }
  }, [id, section, src, theme]);

  return (
    <div
      className={`sw-parts-item ${selected ? "sw-parts-item-selected" : ""} ${canSelect ? "sw-parts-item-clickable" : ""}`}
      onClick={canSelect ? onSelect : undefined}
      role={canSelect ? "button" : undefined}
      tabIndex={canSelect ? 0 : undefined}
      onKeyDown={canSelect ? (e) => e.key === "Enter" && onSelect?.() : undefined}
    >
      <div className="sw-parts-item-label">{id}</div>
      {html ? (
        <div className="sw-parts-preview" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="sw-parts-item-empty">—</div>
      )}
    </div>
  );
}
