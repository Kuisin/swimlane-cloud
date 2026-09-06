import { X } from "lucide-react";
import { useT } from "../../i18n.jsx";
import { usePersistentState } from "../../hooks/use-persistent-state.js";

/**
 * A one-time, dismissible orientation card for first-time GUI-mode users,
 * gated by the same persisted-flag pattern as `sw-editor:tree-collapsed` so
 * it only ever shows once per browser/host. Deliberately a single fixed
 * card rather than a per-element spotlight tour (which would need to track
 * button positions across resize/scroll) — three short tips are enough to
 * orient someone, and this can't drift out of sync with the layout.
 */
export function OnboardingTour() {
  const { t } = useT();
  const [seen, setSeen] = usePersistentState("sw-editor:onboarding-seen", false, {
    parse: (v) => v === "true",
  });

  if (seen) return null;

  return (
    <div className="sw-onboarding-tour">
      <button
        type="button"
        className="sw-icon-btn sw-onboarding-close"
        onClick={() => setSeen(true)}
        title={t("tour.gotIt")}
      >
        <X size={14} />
      </button>
      <h3 className="sw-onboarding-title">{t("tour.title")}</h3>
      <ul className="sw-onboarding-list">
        <li>{t("tour.step1")}</li>
        <li>{t("tour.step2")}</li>
        <li>{t("tour.step3")}</li>
      </ul>
      <button type="button" className="sw-btn sw-btn-accent" onClick={() => setSeen(true)}>
        {t("tour.gotIt")}
      </button>
    </div>
  );
}
