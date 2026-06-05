import { useMemo } from "react";
import { X } from "lucide-react";
import { renderPartsPreviewHtml } from "@swimlane-cloud/diagram-converter";
import { parseDSLParts } from "@swimlane-cloud/diagram-converter/parser";
import { extractPartsCode } from "../../lib/parts-extract.js";
import { useT } from "../../i18n.jsx";

/**
 * Design preview popup for the step inspector's block / prop pickers. Renders
 * each block/prop as a clickable tile so the user can pick directly from the
 * visual preview. For blocks, clicking selects and closes; for props, clicking
 * toggles (multi-select) and keeps the popup open.
 */
export function PartsPreviewPopup({
  open,
  section,
  src,
  theme,
  selectedId,
  readOnly,
  onSelect,
  onClose,
}) {
  const { t } = useT();

  const items = useMemo(() => {
    if (!open) return [];
    const allCode = extractPartsCode(src, section);
    if (!allCode) return [];
    try {
      const { blocks, props } = parseDSLParts(allCode);
      const list =
        section === "block"
          ? Object.values(blocks || {})
          : Object.values(props || {});
      return list.map((item) => {
        const itemCode = extractPartsCode(src, section, item.id);
        let html = "";
        try {
          html = renderPartsPreviewHtml(itemCode, theme);
        } catch {
          /* ignore render errors for individual items */
        }
        return { ...item, html };
      });
    } catch {
      return [];
    }
  }, [open, section, src, theme]);

  if (!open) return null;

  const title = section === "block" ? t("parts.blockTitle") : t("parts.propTitle");

  const isSelected = (id) => {
    if (Array.isArray(selectedId)) return selectedId.includes(id);
    return id === selectedId;
  };

  return (
    <div className="sw-modal-overlay" onClick={onClose}>
      <div className="sw-modal sw-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="sw-modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="sw-icon-btn"
            onClick={onClose}
            title={t("tab.close")}
          >
            <X size={16} />
          </button>
        </div>
        <div className="sw-modal-body">
          {items.length > 0 ? (
            <div className="sw-parts-grid">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={readOnly}
                  className={`sw-parts-item${isSelected(item.id) ? " sw-parts-item-selected" : ""}`}
                  onClick={() => onSelect?.(item.id)}
                >
                  {item.html && (
                    <div
                      className="sw-parts-thumb"
                      dangerouslySetInnerHTML={{ __html: item.html }}
                    />
                  )}
                  <span className="sw-parts-item-label">{item.label || item.id}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="sw-gui-empty">{t("parts.none")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
