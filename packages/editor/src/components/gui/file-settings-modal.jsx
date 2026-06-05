import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useT } from "../../i18n.jsx";
import {
  DEFAULT_DIAGRAM_OPTIONS,
  DEFAULT_COLUMN_TITLES,
} from "@swimlane-cloud/diagram-converter/diagram-options";

const BOOL_OPTIONS = [
  { field: "showLeftGutter", key: "settings.showLeftGutter" },
  { field: "showRightGutter", key: "settings.showRightGutter" },
  { field: "showHeader", key: "settings.showHeader" },
  { field: "showFooter", key: "settings.showFooter" },
  { field: "showDescription", key: "settings.showDescription" },
  { field: "showStepBlockCaptions", key: "settings.showStepBlockCaptions" },
  { field: "mergeAtPreviousBlock", key: "settings.mergeAtPreviousBlock" },
  { field: "branchColorArrows", key: "settings.branchColorArrows" },
];

function initPageDraft(model) {
  const p = model?.page || {};
  return {
    description: p.description || "",
    headerLeft: p.headerLeft || "",
    headerCenter: p.headerCenter || "",
    headerRight: p.headerRight || "",
    footerLeft: p.footerLeft || "",
    footerCenter: p.footerCenter || "",
    footerRight: p.footerRight || "",
    leftTitle: p.leftTitle ?? DEFAULT_COLUMN_TITLES.leftTitle,
    leftSubtitle: p.leftSubtitle ?? DEFAULT_COLUMN_TITLES.leftSubtitle,
    rightTitle: p.rightTitle ?? DEFAULT_COLUMN_TITLES.rightTitle,
    rightSubtitle: p.rightSubtitle ?? DEFAULT_COLUMN_TITLES.rightSubtitle,
  };
}

/**
 * Modal for editing /page/ and /option/ sections of the current DSL file
 * in GUI mode. Edits are committed via onSave(newPage, newOptions).
 */
export function FileSettingsModal({ open, model, readOnly, onSave, onClose }) {
  const { t } = useT();
  const [tab, setTab] = useState("page");
  const [draftPage, setDraftPage] = useState(() => initPageDraft(model));
  const [draftOptions, setDraftOptions] = useState(() => ({ ...(model?.options || {}) }));

  useEffect(() => {
    if (open) {
      setDraftPage(initPageDraft(model));
      setDraftOptions({ ...(model?.options || {}) });
      setTab("page");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const setPage = (field) => (e) =>
    setDraftPage((p) => ({ ...p, [field]: e.target.value }));

  const getOption = (field) =>
    draftOptions[field] !== undefined
      ? draftOptions[field]
      : DEFAULT_DIAGRAM_OPTIONS[field];

  const toggleOption = (field) => {
    const next = !getOption(field);
    setDraftOptions((o) => {
      const updated = { ...o };
      if (next === DEFAULT_DIAGRAM_OPTIONS[field]) {
        delete updated[field];
      } else {
        updated[field] = next;
      }
      return updated;
    });
  };

  function handleSave() {
    onSave(draftPage, draftOptions);
  }

  return (
    <div className="sw-modal-overlay" onClick={onClose}>
      <div className="sw-modal sw-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="sw-modal-header">
          <h2>{t("settings.title")}</h2>
          <button
            type="button"
            className="sw-icon-btn"
            onClick={onClose}
            title={t("tab.close")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="sw-tpl-tabs">
          <button
            type="button"
            className={`sw-tpl-tab${tab === "page" ? " sw-tpl-tab-active" : ""}`}
            onClick={() => setTab("page")}
          >
            {t("settings.pageTab")}
          </button>
          <button
            type="button"
            className={`sw-tpl-tab${tab === "option" ? " sw-tpl-tab-active" : ""}`}
            onClick={() => setTab("option")}
          >
            {t("settings.optionTab")}
          </button>
        </div>

        <div className="sw-modal-body sw-settings-body">
          {tab === "page" && (
            <>
              <div className="sw-settings-group">
                <div className="sw-settings-group-title">{t("settings.description")}</div>
                <textarea
                  className="sw-input sw-textarea-sm"
                  rows={3}
                  value={draftPage.description}
                  disabled={readOnly}
                  onChange={setPage("description")}
                />
              </div>
              <div className="sw-settings-group">
                <div className="sw-settings-group-title">{t("settings.headers")}</div>
                <div className="sw-settings-3col">
                  <label className="sw-field">
                    <span className="sw-field-label">{t("settings.headerLeft")}</span>
                    <input
                      type="text"
                      className="sw-input"
                      value={draftPage.headerLeft}
                      disabled={readOnly}
                      onChange={setPage("headerLeft")}
                    />
                  </label>
                  <label className="sw-field">
                    <span className="sw-field-label">{t("settings.headerCenter")}</span>
                    <input
                      type="text"
                      className="sw-input"
                      value={draftPage.headerCenter}
                      disabled={readOnly}
                      onChange={setPage("headerCenter")}
                    />
                  </label>
                  <label className="sw-field">
                    <span className="sw-field-label">{t("settings.headerRight")}</span>
                    <input
                      type="text"
                      className="sw-input"
                      value={draftPage.headerRight}
                      disabled={readOnly}
                      onChange={setPage("headerRight")}
                    />
                  </label>
                </div>
              </div>
              <div className="sw-settings-group">
                <div className="sw-settings-group-title">{t("settings.footers")}</div>
                <div className="sw-settings-3col">
                  <label className="sw-field">
                    <span className="sw-field-label">{t("settings.footerLeft")}</span>
                    <input
                      type="text"
                      className="sw-input"
                      value={draftPage.footerLeft}
                      disabled={readOnly}
                      onChange={setPage("footerLeft")}
                    />
                  </label>
                  <label className="sw-field">
                    <span className="sw-field-label">{t("settings.footerCenter")}</span>
                    <input
                      type="text"
                      className="sw-input"
                      value={draftPage.footerCenter}
                      disabled={readOnly}
                      onChange={setPage("footerCenter")}
                    />
                  </label>
                  <label className="sw-field">
                    <span className="sw-field-label">{t("settings.footerRight")}</span>
                    <input
                      type="text"
                      className="sw-input"
                      value={draftPage.footerRight}
                      disabled={readOnly}
                      onChange={setPage("footerRight")}
                    />
                  </label>
                </div>
              </div>
            </>
          )}

          {tab === "option" && (
            <>
              <div className="sw-settings-group">
                <div className="sw-settings-group-title">{t("settings.columnTitles")}</div>
                <div className="sw-settings-2col">
                  <label className="sw-field">
                    <span className="sw-field-label">{t("settings.leftTitle")}</span>
                    <input
                      type="text"
                      className="sw-input"
                      value={draftPage.leftTitle}
                      disabled={readOnly}
                      onChange={setPage("leftTitle")}
                    />
                  </label>
                  <label className="sw-field">
                    <span className="sw-field-label">{t("settings.leftSubtitle")}</span>
                    <input
                      type="text"
                      className="sw-input"
                      value={draftPage.leftSubtitle}
                      disabled={readOnly}
                      onChange={setPage("leftSubtitle")}
                    />
                  </label>
                  <label className="sw-field">
                    <span className="sw-field-label">{t("settings.rightTitle")}</span>
                    <input
                      type="text"
                      className="sw-input"
                      value={draftPage.rightTitle}
                      disabled={readOnly}
                      onChange={setPage("rightTitle")}
                    />
                  </label>
                  <label className="sw-field">
                    <span className="sw-field-label">{t("settings.rightSubtitle")}</span>
                    <input
                      type="text"
                      className="sw-input"
                      value={draftPage.rightSubtitle}
                      disabled={readOnly}
                      onChange={setPage("rightSubtitle")}
                    />
                  </label>
                </div>
              </div>
              <div className="sw-settings-group">
                <div className="sw-settings-group-title">{t("settings.renderOptions")}</div>
                <div className="sw-settings-checks">
                  {BOOL_OPTIONS.map(({ field, key }) => (
                    <label key={field} className="sw-settings-check-row">
                      <input
                        type="checkbox"
                        checked={getOption(field)}
                        disabled={readOnly}
                        onChange={() => toggleOption(field)}
                      />
                      <span>{t(key)}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="sw-modal-footer">
          <button type="button" className="sw-btn" onClick={onClose}>
            {t("tab.close")}
          </button>
          {!readOnly && (
            <button type="button" className="sw-btn sw-btn-accent" onClick={handleSave}>
              {t("settings.save")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
