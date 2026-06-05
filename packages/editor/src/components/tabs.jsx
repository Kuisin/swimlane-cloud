import { X } from "lucide-react";
import { useT } from "../i18n.jsx";

/** Open-document tab strip. */
export function Tabs({ openDocuments, activeId, dirtyIds, onSelect, onClose }) {
  const { t } = useT();
  if (!openDocuments.length) return null;
  return (
    <div className="sw-tabs" role="tablist">
      {openDocuments.map((doc) => (
        <div
          key={doc.id}
          role="tab"
          aria-selected={doc.id === activeId}
          className={`sw-tab ${doc.id === activeId ? "sw-tab-active" : ""}`}
          onClick={() => onSelect(doc.id)}
          title={doc.id}
        >
          <span className="sw-tab-label">{doc.name}</span>
          {dirtyIds?.has(doc.id) && <span className="sw-dot" aria-label={t("common.unsaved")} />}
          <button
            type="button"
            className="sw-tab-close"
            title={t("tab.close")}
            onClick={(e) => {
              e.stopPropagation();
              onClose(doc.id);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
