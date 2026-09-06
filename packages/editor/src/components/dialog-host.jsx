import { useEffect, useState } from "react";
import { useT } from "../i18n.jsx";

/**
 * Renders the alert/confirm/prompt request from `useDialogHost` as a themed
 * modal (reusing the same `.sw-modal-overlay`/`.sw-modal` classes as
 * `HelpModal`/`TemplatePanel`), replacing the browser's native dialogs —
 * jarring, unstyled, and disabled in some webviews (e.g. VS Code, which
 * already injects its own `dialogs` prop instead of using this at all).
 */
export function DialogHost({ request, onOk, onCancel }) {
  const { t } = useT();
  const [value, setValue] = useState(() =>
    request?.kind === "prompt" ? (request.defaultValue ?? "") : "",
  );

  useEffect(() => {
    if (request?.kind === "prompt") setValue(request.defaultValue ?? "");
  }, [request]);

  useEffect(() => {
    if (!request) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter" && request.kind !== "prompt") onOk();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [request, onOk, onCancel]);

  if (!request) return null;
  const isPrompt = request.kind === "prompt";
  const isAlert = request.kind === "alert";

  return (
    <div className="sw-modal-overlay" onClick={onCancel}>
      <div
        className="sw-modal sw-dialog"
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sw-modal-body">
          <p className="sw-dialog-message">{request.message}</p>
          {isPrompt && (
            <input
              type="text"
              autoFocus
              className="sw-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOk(value);
              }}
            />
          )}
        </div>
        <div className="sw-modal-footer">
          {!isAlert && (
            <button type="button" className="sw-btn" onClick={onCancel}>
              {t("common.cancel")}
            </button>
          )}
          <button
            type="button"
            className="sw-btn sw-btn-accent"
            autoFocus={!isPrompt}
            onClick={() => onOk(value)}
          >
            {t("common.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
