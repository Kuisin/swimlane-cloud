import { Code2, LayoutList } from "lucide-react";
import { useT } from "../i18n.jsx";

/** GUI ⇄ Text mode toggle over the same DSL document. */
export function ModeToggle({ mode, onChange, guiDisabled }) {
  const { t } = useT();
  return (
    <div className="sw-mode-toggle" role="tablist" aria-label={t("mode.gui") + " / " + t("mode.text")}>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "gui"}
        className={`sw-mode-btn ${mode === "gui" ? "sw-mode-btn-active" : ""}`}
        disabled={guiDisabled}
        title={guiDisabled ? t("mode.guiDisabled") : t("mode.guiTitle")}
        onClick={() => onChange("gui")}
      >
        <LayoutList size={14} /> {t("mode.gui")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "text"}
        className={`sw-mode-btn ${mode === "text" ? "sw-mode-btn-active" : ""}`}
        onClick={() => onChange("text")}
      >
        <Code2 size={14} /> {t("mode.text")}
      </button>
    </div>
  );
}
