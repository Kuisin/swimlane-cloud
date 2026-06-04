import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { renderPartsPreviewHtml } from "@swimlane-cloud/diagram-converter";
import { extractPartsCode } from "../../lib/parts-extract.js";
import { useT } from "../../i18n.jsx";

/**
 * Design preview popup for the step inspector's block / prop pickers. Renders
 * the engine's SVG parts preview so a user can *see* the design while the
 * dropdown stays the primary way to pick. Defaults to the selected definition;
 * a toggle shows the whole palette.
 */
export function PartsPreviewPopup({ open, section, src, theme, selectedId, onClose }) {
  const { t } = useT();
  const [showAll, setShowAll] = useState(!selectedId);

  const html = useMemo(() => {
    if (!open) return "";
    const code = extractPartsCode(src, section, showAll ? null : selectedId);
    if (!code) return "";
    try {
      return renderPartsPreviewHtml(code, theme);
    } catch {
      return "";
    }
  }, [open, section, src, theme, selectedId, showAll]);

  if (!open) return null;

  const title = section === "block" ? t("parts.blockTitle") : t("parts.propTitle");

  return (
    <div className="sw-modal-overlay" onClick={onClose}>
      <div className="sw-modal" onClick={(e) => e.stopPropagation()}>
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
          {selectedId && (
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
          {html ? (
            <div className="sw-parts-preview" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div className="sw-gui-empty">{t("parts.none")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
