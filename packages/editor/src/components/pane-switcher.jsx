import { useT } from "../i18n.jsx";

/**
 * Which pane a narrow screen is showing.
 *
 * On a phone the editor's columns cannot all be on screen at once, so they
 * become one pane at a time and this chooses between them. It is deliberately
 * the same control as `ModeToggle` visually — a row of tabs in the action bar —
 * because they answer neighbouring questions ("how am I editing" / "what am I
 * looking at") and inventing a second visual language for the second one would
 * suggest they are unrelated.
 *
 * Rendered only when the narrow layout is active; a wide screen shows every
 * pane and has nothing to choose.
 */
export function PaneSwitcher({ panes, active, onChange }) {
  const { t } = useT();
  return (
    <div className="sw-mode-toggle sw-pane-switcher" role="tablist" aria-label={t("pane.label")}>
      {panes.map((pane) => (
        <button
          key={pane}
          type="button"
          role="tab"
          aria-selected={active === pane}
          className={`sw-mode-btn ${active === pane ? "sw-mode-btn-active" : ""}`}
          onClick={() => onChange(pane)}
        >
          {t(`pane.${pane}`)}
        </button>
      ))}
    </div>
  );
}
