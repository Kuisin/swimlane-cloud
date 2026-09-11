import { BRANCH_COLOR_STYLES } from "@swimlane-cloud/diagram-converter";
import { useT } from "../../i18n.jsx";

const COLOR_KEYS = Object.keys(BRANCH_COLOR_STYLES);

/**
 * Swatch picker for a branch/section highlight color. Branch colors are a
 * fixed named enum the parser validates against `BRANCH_COLOR_STYLES` — not
 * free hex — so this renders one button per key using the engine's own
 * stroke/bg pair (imported, never hardcoded) plus a neutral "(default)"
 * swatch for no color, instead of a plain text `<select>` of color names.
 */
export function BranchColorField({ value, onChange, disabled }) {
  const { t } = useT();
  return (
    <div className="sw-branch-swatches" role="radiogroup" aria-label={t("branch.accent")}>
      <button
        type="button"
        className={`sw-branch-swatch sw-branch-swatch-default ${!value ? "sw-branch-swatch-on" : ""}`}
        disabled={disabled}
        title={t("branch.default")}
        onClick={() => onChange(null)}
      >
        <span className="sw-branch-swatch-dot" />
      </button>
      {COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className={`sw-branch-swatch ${value === key ? "sw-branch-swatch-on" : ""}`}
          disabled={disabled}
          title={key}
          onClick={() => onChange(key)}
        >
          <span
            className="sw-branch-swatch-dot"
            style={{
              background: BRANCH_COLOR_STYLES[key].bg,
              borderColor: BRANCH_COLOR_STYLES[key].stroke,
            }}
          />
        </button>
      ))}
    </div>
  );
}
