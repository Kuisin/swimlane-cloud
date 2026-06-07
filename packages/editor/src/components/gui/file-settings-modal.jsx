import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { DEFAULT_COLUMN_TITLES } from "@swimlane-cloud/diagram-converter/diagram-options";
import { useT } from "../../i18n.jsx";
import { applyModelEdit } from "../../lib/gui-model.js";
import { DefinitionsEditor } from "./definitions-editor.jsx";

const BOOL_OPTIONS = [
  "showLeftGutter",
  "showRightGutter",
  "showHeader",
  "showFooter",
  "showDescription",
  "showStepBlockCaptions",
  "mergeAtPreviousBlock",
  "branchColorArrows",
];

const BOOL_LABEL_KEYS = {
  showLeftGutter: "settings.showLeftGutter",
  showRightGutter: "settings.showRightGutter",
  showHeader: "settings.showHeader",
  showFooter: "settings.showFooter",
  showDescription: "settings.showDescription",
  showStepBlockCaptions: "settings.showCaptions",
  mergeAtPreviousBlock: "settings.mergeAtPrev",
  branchColorArrows: "settings.branchColorArrows",
};

/**
 * Modal for editing /page/ and /option/ metadata without switching to text mode.
 */
export function FileSettingsModal({ open, src, readOnly, onChange, onClose, theme }) {
  const { t } = useT();
  const [tab, setTab] = useState("page");

  const model = useMemo(() => {
    if (!open || !src) return null;
    try {
      return parseDSL(src);
    } catch {
      return null;
    }
  }, [open, src]);

  if (!open) return null;

  function patchPage(field, value) {
    if (readOnly) return;
    onChange(applyModelEdit(src, (draft) => {
      if (!draft.page) draft.page = {};
      draft.page[field] = value || undefined;
    }));
  }

  function patchTitle(value) {
    if (readOnly) return;
    onChange(applyModelEdit(src, (draft) => {
      draft.title = value;
    }));
  }

  function patchOption(field, value) {
    if (readOnly) return;
    onChange(applyModelEdit(src, (draft) => {
      if (!draft.options) draft.options = {};
      if (value === null || value === undefined) {
        delete draft.options[field];
      } else {
        draft.options[field] = value;
      }
    }));
  }

  const page = model?.page || {};
  const options = model?.options || {};
  const getOption = (field) => options[field] !== undefined ? Boolean(options[field]) : true;

  return (
    <div className="sw-modal-overlay" onClick={onClose}>
      <div className="sw-modal sw-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="sw-modal-header">
          <h2>{t("settings.title")}</h2>
          <button type="button" className="sw-icon-btn" onClick={onClose} title={t("tab.close")}>
            <X size={16} />
          </button>
        </div>
        <div className="sw-settings-tabs">
          <button
            type="button"
            className={`sw-tpl-tab ${tab === "page" ? "sw-tpl-tab-active" : ""}`}
            onClick={() => setTab("page")}
          >
            {t("settings.pageTab")}
          </button>
          <button
            type="button"
            className={`sw-tpl-tab ${tab === "option" ? "sw-tpl-tab-active" : ""}`}
            onClick={() => setTab("option")}
          >
            {t("settings.optionTab")}
          </button>
          {["role", "block", "prop"].map((k) => (
            <button
              key={k}
              type="button"
              className={`sw-tpl-tab ${tab === k ? "sw-tpl-tab-active" : ""}`}
              onClick={() => setTab(k)}
            >
              {t(`settings.${k}Tab`)}
            </button>
          ))}
        </div>
        <div className="sw-modal-body">
          {tab === "page" && (
            <div className="sw-settings-form">
              <div className="sw-field">
                <span className="sw-field-label">{t("settings.pageTitle")}</span>
                <input
                  type="text"
                  className="sw-input"
                  value={model?.title || ""}
                  disabled={readOnly}
                  onChange={(e) => patchTitle(e.target.value)}
                />
              </div>
              {getOption("showDescription") && (
                <div className="sw-field">
                  <span className="sw-field-label">{t("settings.description")}</span>
                  <textarea
                    className="sw-input sw-textarea-sm"
                    rows={2}
                    value={page.description || ""}
                    disabled={readOnly}
                    onChange={(e) => patchPage("description", e.target.value)}
                  />
                </div>
              )}
              {getOption("showHeader") && (
                <div className="sw-field-row sw-settings-row3">
                  <div className="sw-field">
                    <span className="sw-field-label">{t("settings.headerLeft")}</span>
                    <input type="text" className="sw-input" value={page.headerLeft || ""} disabled={readOnly} onChange={(e) => patchPage("headerLeft", e.target.value)} />
                  </div>
                  <div className="sw-field">
                    <span className="sw-field-label">{t("settings.headerCenter")}</span>
                    <input type="text" className="sw-input" value={page.headerCenter || ""} disabled={readOnly} onChange={(e) => patchPage("headerCenter", e.target.value)} />
                  </div>
                  <div className="sw-field">
                    <span className="sw-field-label">{t("settings.headerRight")}</span>
                    <input type="text" className="sw-input" value={page.headerRight || ""} disabled={readOnly} onChange={(e) => patchPage("headerRight", e.target.value)} />
                  </div>
                </div>
              )}
              {getOption("showFooter") && (
                <div className="sw-field-row sw-settings-row3">
                  <div className="sw-field">
                    <span className="sw-field-label">{t("settings.footerLeft")}</span>
                    <input type="text" className="sw-input" value={page.footerLeft || ""} disabled={readOnly} onChange={(e) => patchPage("footerLeft", e.target.value)} />
                  </div>
                  <div className="sw-field">
                    <span className="sw-field-label">{t("settings.footerCenter")}</span>
                    <input type="text" className="sw-input" value={page.footerCenter || ""} disabled={readOnly} onChange={(e) => patchPage("footerCenter", e.target.value)} />
                  </div>
                  <div className="sw-field">
                    <span className="sw-field-label">{t("settings.footerRight")}</span>
                    <input type="text" className="sw-input" value={page.footerRight || ""} disabled={readOnly} onChange={(e) => patchPage("footerRight", e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === "option" && (
            <div className="sw-settings-form">
              <div className="sw-settings-bools">
                {BOOL_OPTIONS.map((field) => (
                  <label key={field} className="sw-settings-bool">
                    <input
                      type="checkbox"
                      checked={options[field] !== undefined ? Boolean(options[field]) : true}
                      disabled={readOnly}
                      onChange={(e) => patchOption(field, e.target.checked)}
                    />
                    <span>{t(BOOL_LABEL_KEYS[field])}</span>
                  </label>
                ))}
              </div>
              {getOption("showLeftGutter") && (
                <div className="sw-field-row sw-settings-row2">
                  <div className="sw-field">
                    <span className="sw-field-label">{t("settings.leftTitle")}</span>
                    <input type="text" className="sw-input" value={page.leftTitle ?? DEFAULT_COLUMN_TITLES.leftTitle} disabled={readOnly} onChange={(e) => patchPage("leftTitle", e.target.value)} />
                  </div>
                  <div className="sw-field">
                    <span className="sw-field-label">{t("settings.leftSubtitle")}</span>
                    <input type="text" className="sw-input" value={page.leftSubtitle ?? DEFAULT_COLUMN_TITLES.leftSubtitle} disabled={readOnly} onChange={(e) => patchPage("leftSubtitle", e.target.value)} />
                  </div>
                </div>
              )}
              {getOption("showRightGutter") && (
                <div className="sw-field-row sw-settings-row2">
                  <div className="sw-field">
                    <span className="sw-field-label">{t("settings.rightTitle")}</span>
                    <input type="text" className="sw-input" value={page.rightTitle ?? DEFAULT_COLUMN_TITLES.rightTitle} disabled={readOnly} onChange={(e) => patchPage("rightTitle", e.target.value)} />
                  </div>
                  <div className="sw-field">
                    <span className="sw-field-label">{t("settings.rightSubtitle")}</span>
                    <input type="text" className="sw-input" value={page.rightSubtitle ?? (DEFAULT_COLUMN_TITLES.rightSubtitle || "")} disabled={readOnly} onChange={(e) => patchPage("rightSubtitle", e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}
          {["role", "block", "prop"].includes(tab) && (
            <DefinitionsEditor
              key={tab}
              kind={tab}
              src={src}
              readOnly={readOnly}
              onChange={onChange}
              theme={theme}
            />
          )}
        </div>
      </div>
    </div>
  );
}
