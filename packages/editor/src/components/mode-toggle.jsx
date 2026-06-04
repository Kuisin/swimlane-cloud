import { Code2, LayoutList } from "lucide-react";

/** GUI ⇄ Text mode toggle over the same DSL document. */
export function ModeToggle({ mode, onChange, guiDisabled, guiDisabledReason }) {
  return (
    <div className="sw-mode-toggle" role="tablist" aria-label="Editor mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "gui"}
        className={`sw-mode-btn ${mode === "gui" ? "sw-mode-btn-active" : ""}`}
        disabled={guiDisabled}
        title={guiDisabled ? guiDisabledReason : "GUI editing"}
        onClick={() => onChange("gui")}
      >
        <LayoutList size={14} /> GUI
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "text"}
        className={`sw-mode-btn ${mode === "text" ? "sw-mode-btn-active" : ""}`}
        onClick={() => onChange("text")}
      >
        <Code2 size={14} /> Text
      </button>
    </div>
  );
}
