import { X } from "lucide-react";

/** Open-document tab strip. */
export function Tabs({ openDocuments, activeId, dirtyIds, onSelect, onClose }) {
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
          {dirtyIds?.has(doc.id) && <span className="sw-dot" aria-label="unsaved" />}
          <button
            type="button"
            className="sw-tab-close"
            title="Close"
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
