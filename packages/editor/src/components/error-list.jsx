import { AlertTriangle } from "lucide-react";

/** Non-blocking list of parse errors mapped to line numbers. */
export function ErrorList({ errors, includeText = true, onSelectLine }) {
  if (!errors?.length) return null;
  return (
    <div className="sw-error-list">
      <div className="sw-error-list-title">
        <AlertTriangle size={12} aria-hidden /> Parse errors
      </div>
      {errors.map((err, i) => (
        <button
          key={i}
          type="button"
          className="sw-error-row"
          onClick={onSelectLine ? () => onSelectLine(err.line) : undefined}
        >
          <span className="sw-error-line">L{err.line}</span> {err.msg}
          {includeText && err.text ? (
            <span className="sw-error-text"> → {String(err.text).trim()}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
