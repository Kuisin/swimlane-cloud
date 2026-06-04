import { X } from "lucide-react";
import { useT } from "../i18n.jsx";

const HELP_SECTIONS = [
  ["@kai-swimlane … @end", "help.markers"],
  ["/title/", "help.title2"],
  ["/page/", "help.page"],
  ["/option/", "help.option"],
  ["/role/", "help.role"],
  ["/block/", "help.block"],
  ["/prop/", "help.prop"],
  ["/line/", "help.line"],
];

/** Lightweight built-in help (no markdown dep). */
export function HelpModal({ open, onClose }) {
  const { t } = useT();
  if (!open) return null;
  return (
    <div className="sw-modal-overlay" onClick={onClose}>
      <div className="sw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sw-modal-header">
          <h2>{t("help.title")}</h2>
          <button type="button" className="sw-icon-btn" onClick={onClose} title={t("tab.close")}>
            <X size={16} />
          </button>
        </div>
        <div className="sw-modal-body">
          <dl className="sw-help-dl">
            {HELP_SECTIONS.map(([term, key]) => (
              <div key={term} className="sw-help-row">
                <dt>{term}</dt>
                <dd>{t(key)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
