import { useT } from "../i18n.jsx";

/**
 * Right pane: presentational live SVG preview. The engine is DOM-free and
 * returns an SVG string, which is injected with dangerouslySetInnerHTML (no
 * React <Diagram> component exists in this engine). The SVG string is produced
 * by the `useLivePreview` hook in the parent.
 *
 * When `onRowClick` is provided (GUI mode), invisible hit-target rects in the
 * interactive SVG carry `data-row-index` attributes; clicks are resolved via
 * event delegation so no per-element listener is needed.
 */
export function PreviewPane({ svg, hasErrors, onRowClick }) {
  const { t } = useT();

  function handleClick(e) {
    const el = e.target.closest?.("[data-row-index]");
    if (!el) return;
    const idx = parseInt(el.getAttribute("data-row-index"), 10);
    if (!isNaN(idx)) onRowClick(idx);
  }

  return (
    <div
      className="sw-preview"
      aria-label={t("preview.label")}
      onClick={onRowClick ? handleClick : undefined}
    >
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
