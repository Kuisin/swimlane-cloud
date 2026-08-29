import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { renderPartsPreviewHtml } from "@swimlane-cloud/diagram-converter";
import { TEMPLATE_SECTIONS, hostHas } from "../host.js";
import { useT } from "../i18n.jsx";

/**
 * Section template modal. One tab per section (page/option/role/block/prop).
 * Loads templates via host.listSectionTemplates and renders a block/prop
 * preview via the engine. Insert is disabled for sections whose policy
 * mode === 'forced'.
 */
export function TemplatePanel({ open, host, theme, policies, onClose, onInsert }) {
  const { t } = useT();
  const [section, setSection] = useState("role");
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !hostHas(host, "listSectionTemplates")) {
      setTemplates([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    host
      .listSectionTemplates(section)
      .then((list) => {
        if (!cancelled) setTemplates(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || t("tpl.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, host, section]);

  if (!open) return null;

  const policy = policies?.[section];
  const forced = policy?.mode === "forced";
  const supports = hostHas(host, "listSectionTemplates");

  return (
    <div className="sw-modal-overlay" onClick={onClose}>
      <div className="sw-modal sw-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="sw-modal-header">
          <h2>{t("tpl.title")}</h2>
          <button type="button" className="sw-icon-btn" onClick={onClose} title={t("tab.close")}>
            <X size={16} />
          </button>
        </div>

        <div className="sw-tpl-tabs">
          {TEMPLATE_SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`sw-tpl-tab ${section === s ? "sw-tpl-tab-active" : ""}`}
              onClick={() => setSection(s)}
            >
              /{s}/{policies?.[s]?.mode === "forced" && <span className="sw-tpl-lock"> 🔒</span>}
            </button>
          ))}
        </div>

        <div className="sw-modal-body">
          {forced && <div className="sw-tpl-forced">{t("tpl.forced")}</div>}
          {!supports && <div className="sw-gui-empty">{t("tpl.noHost")}</div>}
          {error && <div className="sw-tpl-forced">{error}</div>}
          {loading && <div className="sw-gui-empty">{t("common.loading")}</div>}

          {!loading &&
            supports &&
            templates.map((tpl) => (
              <TemplateCard
                key={tpl.slug}
                template={tpl}
                section={section}
                theme={theme}
                disabled={forced}
                onInsert={() => onInsert(section, tpl)}
              />
            ))}
          {!loading && supports && templates.length === 0 && !error && (
            <div className="sw-gui-empty">{t("tpl.none")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ template, section, theme, disabled, onInsert }) {
  const { t } = useT();
  const showPreview = section === "block" || section === "prop";
  let previewHtml = null;
  if (showPreview) {
    try {
      previewHtml = renderPartsPreviewHtml(template.body, theme);
    } catch {
      previewHtml = null;
    }
  }
  return (
    <div className="sw-tpl-card">
      <div className="sw-tpl-card-head">
        <span className="sw-tpl-card-name">
          {template.name}
          {template.isDefault && <span className="sw-tpl-default"> {t("tpl.default")}</span>}
        </span>
        <button type="button" className="sw-btn sw-btn-sm" disabled={disabled} onClick={onInsert}>
          {t("tpl.insert")}
        </button>
      </div>
      {previewHtml ? (
        <div className="sw-tpl-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
      ) : (
        <pre className="sw-tpl-code">{template.body}</pre>
      )}
    </div>
  );
}
