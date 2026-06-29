import { X } from "lucide-react";
import { useT } from "../i18n.jsx";

const HELP_SECTIONS = [
  [
    "@kai-swimlane … @end",
    "help.markers",
    "@kai-swimlane\n\n/title/\n…\n\n@end",
  ],
  [
    "/title/",
    "help.title2",
    "/title/\nDiagram title here",
  ],
  [
    "/page/",
    "help.page",
    "/page/\ndescription: …;\nheader-left: …;\nheader-right: …;",
  ],
  [
    "/option/",
    "help.option",
    "/option/\nshow-left-gutter: true;\nshow-right-gutter: true;\nleft-title: Procedure;",
  ],
  [
    "/role/",
    "help.role",
    "/role/\n\n<roleId>\nlabel: Actor name;\nbackground-color: #eef2ff;\ntext-color: #3730a3;\nicon: #user;",
  ],
  [
    "/block/",
    "help.block",
    "/block/\n\n<blockId>\nbackground-color: #dbeafe;\ntext-color: #1e40af;\nshape: rounded;\nicon: #zap;",
  ],
  [
    "/prop/",
    "help.prop",
    "/prop/\n\n<propId>\nlabel: Note text;\nside: right;",
  ],
  [
    "/line/",
    "help.line",
    "/line/\n\n[role: Step text] <block>\nlabel: …;\nprops: propId;\n\nif (condition?) is (yes)\n  [role: Branch A]\nelse\n  [role: Branch B]\nendif\n\nfork\n  [role: Parallel A]\nand\n  [role: Parallel B]\nendfork",
  ],
];

/** Lightweight built-in help (no markdown dep). */
export function HelpModal({ open, onClose }) {
  const { t } = useT();
  if (!open) return null;
  return (
    <div className="sw-modal-overlay" onClick={onClose}>
      <div className="sw-modal sw-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="sw-modal-header">
          <h2>{t("help.title")}</h2>
          <button type="button" className="sw-icon-btn" onClick={onClose} title={t("tab.close")}>
            <X size={16} />
          </button>
        </div>
        <div className="sw-modal-body">
          <dl className="sw-help-dl">
            {HELP_SECTIONS.map(([term, key, code]) => (
              <div key={term} className="sw-help-row">
                <dt>{term}</dt>
                <dd>{t(key)}</dd>
                {code && <pre className="sw-help-code">{code}</pre>}
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
