/**
 * Right pane: presentational live SVG preview. The engine is DOM-free and
 * returns an SVG string, which is injected with dangerouslySetInnerHTML (no
 * React <Diagram> component exists in this engine). The SVG string is produced
 * by the `useLivePreview` hook in the parent.
 */
export function PreviewPane({ svg, hasErrors }) {
  return (
    <div className="sw-preview" aria-label="Diagram preview">
      {svg ? (
        <div className="sw-preview-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="sw-preview-empty">
          {hasErrors ? "Fix parse errors to see the preview." : "No diagram yet."}
        </div>
      )}
    </div>
  );
}
