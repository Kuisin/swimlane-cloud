import { X } from "lucide-react";
import { getFrameStepIndices, stepBlockDisplayName } from "../../lib/flow-rows.js";
import { useT } from "../../i18n.jsx";

/**
 * "Move to…" popup. Lists the reorderable steps in the current step's branch
 * frame as ordered positions; picking one moves the current step there. A
 * trailing entry moves it to the end of the frame. `onMove(targetRowIndex)`
 * receives a rows index (insert-before semantics; matches `moveRow`).
 */
export function MoveStepModal({ open, rows, currentIndex, lanes, onMove, onClose }) {
  const { t } = useT();
  if (!open) return null;

  const frame = getFrameStepIndices(rows, currentIndex);
  const others = frame.filter((i) => i !== currentIndex);
  const lastStep = frame[frame.length - 1];

  return (
    <div className="sw-modal-overlay" onClick={onClose}>
      <div className="sw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sw-modal-header">
          <h2>{t("move.title")}</h2>
          <button type="button" className="sw-icon-btn" onClick={onClose} title={t("tab.close")}>
            <X size={16} />
          </button>
        </div>
        <div className="sw-modal-body">
          {others.length === 0 ? (
            <div className="sw-gui-empty">{t("move.empty")}</div>
          ) : (
            <>
              <p className="sw-move-hint">{t("move.hint")}</p>
              <ol className="sw-move-list">
                {frame.map((rowIdx, pos) => {
                  const isCurrent = rowIdx === currentIndex;
                  return (
                    <li key={rowIdx}>
                      <button
                        type="button"
                        className={`sw-move-item ${isCurrent ? "sw-move-item-current" : ""}`}
                        disabled={isCurrent}
                        onClick={() => onMove(rowIdx)}
                      >
                        <span className="sw-move-pos">{pos + 1}</span>
                        <span className="sw-move-label">
                          {stepBlockDisplayName(rows[rowIdx], rowIdx, t)}
                        </span>
                        {isCurrent && <span className="sw-move-current-tag">{t("move.current")}</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                className="sw-btn sw-move-end"
                onClick={() => onMove(lastStep + 1)}
              >
                {t("move.toEnd")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
