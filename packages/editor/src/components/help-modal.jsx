import { X } from "lucide-react";

const HELP_SECTIONS = [
  ["@kai-swimlane … @end", "Every document is wrapped in these markers."],
  ["/title/", "One line: the diagram title."],
  ["/page/", "description / header-* / footer-* metadata."],
  ["/option/", "Diagram options and gutter column titles."],
  ["/role/", "Lanes: <id> then label:, background-color:, text-color:, icon:."],
  ["/block/", "Reusable step styles referenced as [role: text] <blockId>."],
  ["/prop/", "Side annotations attached to steps via props: a,b;."],
  ["/line/", "The flow. [role: text] steps, if (…) is (…) than / elseif / else / endif, fork / and / endfork, branch / end-branch, section / end-section, merge: id;, [loop]."],
];

/** Lightweight built-in help (no markdown dep). */
export function HelpModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="sw-modal-overlay" onClick={onClose}>
      <div className="sw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sw-modal-header">
          <h2>DSL quick reference</h2>
          <button type="button" className="sw-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="sw-modal-body">
          <dl className="sw-help-dl">
            {HELP_SECTIONS.map(([term, desc]) => (
              <div key={term} className="sw-help-row">
                <dt>{term}</dt>
                <dd>{desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
