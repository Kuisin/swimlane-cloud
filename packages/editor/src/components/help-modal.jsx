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
    "icon: #name;",
    "help.icon",
    "icon: #check;\nicon: #alert-triangle;\nicon: 🔥;",
  ],
  [
    "// … / *** …",
    "help.comment",
    "// note about this branch\nif (channel?) is (web) than #blue\n  [role: web form]\nendif",
  ],
  [
    "/line/",
    "help.line",
    "/line/\n\n[role: Step text] <block>\nlabel: …;\nprops: propId;\n\nif (condition?) is (yes)\n  [role: Branch A]\nelse\n  [role: Branch B]\nendif\n\nfork\n  [role: Parallel A]\nand\n  [role: Parallel B]\nendfork",
  ],
  [
    "[loop]",
    "help.loop",
    "if (retry?) is (yes) than\n  [role: process item]\n  [loop]\nelseif (no) than\n  [role: done]\nendif",
  ],
  [
    "section (name) #color … end-section",
    "help.section",
    "[role: confirm order]\nsection (audit) #blue\n  [role: save audit detail]\nend-section\n[role: show receipt]",
  ],
  [
    "branch (name) #color … end-branch",
    "help.branch",
    "[role: confirm order]\nbranch (shipping)\n  [role: record picking detail]\nend-branch\n[role: show receipt]",
  ],
  [
    "merge: id;",
    "help.merge",
    "if (cancel?) is (yes) than #red\n  [role: accept cancellation]\n  merge: done;\nelse\n  [role: normal close]\nendif\n\n[role: transaction complete]\nid: done;",
  ],
  [
    "arrow: solid|dashed|dotted;",
    "help.arrow",
    "[role: step]\narrow: dashed;\n[role: next step]",
  ],
];

/**
 * Starter role / block / prop snippets. These mirror the reusable catalog
 * described in dsl-rule.md so the help modal doubles as a copy-paste
 * reference even on hosts that don't implement `listSectionTemplates`
 * (see TemplatePanel, which covers the project-backed template catalog).
 */
const TEMPLATE_GROUPS = [
  {
    section: "/role/",
    titleKey: "help.tplRoleTitle",
    items: [
      ["role_applicant", "label: Applicant;\ntext-color: #1e293b;\nbackground-color: #ffffff;"],
      ["role_approver", "label: Approver;\ntext-color: #166534;\nbackground-color: #f0fdf4;"],
      [
        "role_system",
        "label: System;\ntext-color: #3730a3;\nbackground-color: #eef2ff;\nicon: #database;",
      ],
    ],
  },
  {
    section: "/block/",
    titleKey: "help.tplBlockTitle",
    items: [
      [
        "block_apply",
        "background-color: #dbeafe;\ntext-color: #1e40af;\nborder-color: #2563eb;\nshape: rounded;\nicon: #zap;",
      ],
      [
        "block_approve",
        "background-color: #dcfce7;\ntext-color: #166534;\nborder-color: #16a34a;\nshape: rounded;\nicon: #circle-check;",
      ],
      [
        "block_reject",
        "background-color: #fee2e2;\ntext-color: #991b1b;\nborder-color: #dc2626;\nshape: hex;\nicon: #alert-triangle;",
      ],
    ],
  },
  {
    section: "/prop/",
    titleKey: "help.tplPropTitle",
    items: [
      ["REQ_DOC", "label: Request form;\nside: right;"],
      ["APPR_LOG", "label: Approval log;\nside: left;"],
    ],
  },
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

          <div className="sw-help-templates">
            <h3 className="sw-help-templates-title">{t("help.templatesTitle")}</h3>
            <p className="sw-help-templates-hint">{t("help.templatesHint")}</p>
            {TEMPLATE_GROUPS.map((group) => (
              <div key={group.section} className="sw-help-tpl-group">
                <h4 className="sw-help-tpl-group-title">
                  {group.section} — {t(group.titleKey)}
                </h4>
                <dl className="sw-help-dl">
                  {group.items.map(([id, code]) => (
                    <div key={id} className="sw-help-row">
                      <dt>{`<${id}>`}</dt>
                      <pre className="sw-help-code">{`<${id}>\n${code}`}</pre>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
