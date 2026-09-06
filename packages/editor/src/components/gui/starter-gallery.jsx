import { STARTER_TEMPLATES } from "../../lib/starter-templates.js";
import { useT } from "../../i18n.jsx";

/**
 * Card picker over `STARTER_TEMPLATES`, shown wherever a beginner needs a
 * recognizable starting shape instead of one blank step: the zero-files
 * folder-tree empty state (creates a new file from the pick) and the
 * zero-rows GUI empty state (replaces the current file's content). Both call
 * sites own what "picking" actually does — this component only renders the
 * catalog and a "start blank" escape hatch.
 */
export function StarterGallery({ title, hint, onSelect, onSkip, skipLabel }) {
  const { t } = useT();
  return (
    <div className="sw-starter-gallery">
      {title && <h3 className="sw-starter-title">{title}</h3>}
      {hint && <p className="sw-starter-hint">{hint}</p>}
      <div className="sw-starter-cards">
        {STARTER_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            className="sw-starter-card"
            onClick={() => onSelect(tpl.dsl)}
          >
            <span className="sw-starter-card-title">{t(tpl.titleKey)}</span>
            <span className="sw-starter-card-desc">{t(tpl.descriptionKey)}</span>
          </button>
        ))}
      </div>
      {onSkip && (
        <button type="button" className="sw-starter-skip" onClick={onSkip}>
          {skipLabel ?? t("starter.startBlank")}
        </button>
      )}
    </div>
  );
}
