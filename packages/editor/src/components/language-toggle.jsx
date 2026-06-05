import { Globe } from "lucide-react";
import { LANGUAGES, useT } from "../i18n.jsx";

/** Compact language switcher (EN / 日本語). */
export function LanguageToggle() {
  const { lang, setLang, t } = useT();
  return (
    <div className="sw-lang-toggle" role="group" aria-label={t("lang.label")} title={t("lang.label")}>
      <Globe size={13} className="sw-lang-icon" aria-hidden />
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          className={`sw-lang-btn ${lang === l.code ? "sw-lang-btn-active" : ""}`}
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
