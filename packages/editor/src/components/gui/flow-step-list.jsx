import { useState } from "react";
import {
  rowBadgeLabel,
  rowBadgeKind,
  rowLaneInfo,
  rowSummaryText,
  rowStepMeta,
  rowListIndentDepth,
  branchCaseBadgeStyle,
  isStepRow,
  sameReorderFrame,
} from "../../lib/flow-rows.js";
import { useT } from "../../i18n.jsx";

/**
 * Read/select list of flow rows (steps, branches, groups). Nesting indent is
 * derived from branch geometry. Each row shows a color-coded type badge, a lane
 * chip for steps, the localized summary, and a muted meta suffix. Steps can be
 * reordered by drag-and-drop within their branch frame; clicking selects a row.
 */
export function FlowStepList({ rows, lanes, selectedIndex, lockedRows, canReorder, onReorder, onSelect }) {
  const { t } = useT();
  const [dragIndex, setDragIndex] = useState(-1);
  const [overIndex, setOverIndex] = useState(-1);

  if (!rows?.length) {
    return <div className="sw-gui-empty">{t("gui.noRows")}</div>;
  }

  const draggable = (i) => Boolean(canReorder) && isStepRow(rows[i]);
  const validTarget = (i) =>
    dragIndex >= 0 && i !== dragIndex && sameReorderFrame(rows, dragIndex, i);

  function endDrag() {
    setDragIndex(-1);
    setOverIndex(-1);
  }

  return (
    <ul className="sw-flow-list">
      {rows.map((row, index) => {
        const locked = lockedRows?.has(index);
        const lane = rowLaneInfo(row, lanes, t);
        const meta = rowStepMeta(row);
        const isDragging = dragIndex === index;
        const isOver = overIndex === index && validTarget(index);
        return (
          <li
            key={index}
            className={`sw-flow-row ${
              selectedIndex === index ? "sw-flow-row-selected" : ""
            } ${locked ? "sw-flow-row-locked" : ""} ${isDragging ? "sw-flow-row-dragging" : ""} ${
              isOver ? "sw-flow-row-over" : ""
            }`}
            style={{ paddingLeft: 10 + rowListIndentDepth(rows, index) * 16 }}
            onClick={() => !locked && onSelect(index)}
            title={locked ? t("errors.title") : undefined}
            draggable={draggable(index)}
            onDragStart={(e) => {
              if (!draggable(index)) return;
              setDragIndex(index);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!validTarget(index)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (overIndex !== index) setOverIndex(index);
            }}
            onDrop={(e) => {
              if (!validTarget(index)) return;
              e.preventDefault();
              onReorder?.(dragIndex, index);
              endDrag();
            }}
            onDragEnd={endDrag}
          >
            <span
              className={`sw-flow-badge sw-badge-${rowBadgeKind(row)}`}
              style={branchCaseBadgeStyle(row)}
            >
              {rowBadgeLabel(row, t)}
            </span>
            {lane && (
              <span
                className="sw-flow-lane"
                style={{ background: lane.bg, color: lane.fg }}
                title={lane.label}
              >
                {lane.label}
              </span>
            )}
            <span className="sw-flow-summary">{rowSummaryText(row, lanes, t)}</span>
            {meta && <span className="sw-flow-meta">{meta}</span>}
          </li>
        );
      })}
    </ul>
  );
}
