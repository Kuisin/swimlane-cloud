import { COLOR_PRESET_GROUPS, findMatchingPresetValue } from "../../lib/color-presets.js";
import { useT } from "../../i18n.jsx";

/** Color input with a swatch dropdown of curated presets. */
export function ColorField({ label, value, onChange }) {
  const { t } = useT();
  const preset = findMatchingPresetValue(value);
  return (
    <label className="sw-field">
      <span className="sw-field-label">{label}</span>
      <div className="sw-color-field">
        <input
          type="text"
          className="sw-input sw-color-text"
          value={value ?? ""}
          placeholder="#rrggbb"
          onChange={(e) => onChange(e.target.value || null)}
        />
        <input
          type="color"
          className="sw-color-swatch"
          value={/^#[0-9a-fA-F]{6}$/.test(value || "") ? value : "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
        />
        <select
          className="sw-input sw-color-preset"
          value={preset}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        >
          <option value="">{t("color.presets")}</option>
          {COLOR_PRESET_GROUPS.map((group) => (
            <optgroup key={group.id} label={group.label}>
              {group.colors.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label} ({c.value})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </label>
  );
}
