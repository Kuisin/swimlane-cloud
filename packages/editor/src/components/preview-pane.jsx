import { useT } from "../i18n.jsx";

/**
 * Right pane: presentational live SVG preview. The engine is DOM-free and
 * returns an SVG string, which is injected with dangerouslySetInnerHTML (no
 * React <Diagram> component exists in this engine). The SVG string is produced
 * by the `useLivePreview` hook in the parent.
 */
export function PreviewPane({ svg, hasErrors }) {
  const { t } = useT();
  return (
    <div className="sw-preview" aria-label={t("preview.label")}>
      {svg ? (
        <div className="sw-preview-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="sw-preview-empty">
          {hasErrors ? t("preview.fixErrors") : t("preview.empty")}
        </div>
      )}
    </div>
  );
}
