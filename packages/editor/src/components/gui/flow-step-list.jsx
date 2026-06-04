import {
  rowBadgeLabel,
  rowBadgeKind,
  rowLaneLabel,
  rowSummaryText,
  rowStepMeta,
  rowListIndentDepth,
  branchCaseBadgeStyle,
} from "../../lib/flow-rows.js";
import { useT } from "../../i18n.jsx";

/**
 * Read/select list of flow rows (steps, branches, groups). Nesting indent is
 * derived from branch geometry. Each row shows a color-coded type badge, a lane
 * chip for steps, the localized summary, and a muted meta suffix. Clicking a
 * row selects it for the inspector.
 */
export function FlowStepList({ rows, lanes, selectedIndex, lockedRows, onSelect }) {
  const { t } = useT();
  if (!rows?.length) {
    return <div className="sw-gui-empty">{t("gui.noRows")}</div>;
  }
  return (
    <ul className="sw-flow-list">
      {rows.map((row, index) => {
        const indent = rowListIndentDepth(rows, index);
        const locked = lockedRows?.has(index);
        const lane = rowLaneLabel(row, lanes, t);
        const meta = rowStepMeta(row);
        return (
          <li
            key={index}
            className={`sw-flow-row ${selectedIndex === index ? "sw-flow-row-selected" : ""} ${
              locked ? "sw-flow-row-locked" : ""
            }`}
            style={{ paddingLeft: 10 + indent * 16 }}
            onClick={() => !locked && onSelect(index)}
            title={locked ? t("errors.title") : undefined}
          >
            <span
              className={`sw-flow-badge sw-badge-${rowBadgeKind(row)}`}
              style={branchCaseBadgeStyle(row)}
            >
              {rowBadgeLabel(row)}
            </span>
            {lane && <span className="sw-flow-lane">{lane}</span>}
            <span className="sw-flow-summary">{rowSummaryText(row, lanes, t)}</span>
            {meta && <span className="sw-flow-meta">{meta}</span>}
          </li>
        );
      })}
    </ul>
  );
}
