import { rowBadgeLabel, rowSummaryText, rowListIndentDepth, branchCaseBadgeStyle } from "../../lib/flow-rows.js";

/**
 * Read/select list of flow rows (steps, branches, groups). Nesting indent is
 * derived from branch geometry. Clicking a row selects it for the inspector.
 */
export function FlowStepList({ rows, lanes, selectedIndex, lockedRows, onSelect }) {
  if (!rows?.length) {
    return <div className="sw-gui-empty">No flow rows yet. Add a step below.</div>;
  }
  return (
    <ul className="sw-flow-list">
      {rows.map((row, index) => {
        const indent = rowListIndentDepth(rows, index);
        const locked = lockedRows?.has(index);
        return (
          <li
            key={index}
            className={`sw-flow-row sw-flow-kind-${row.kind} ${
              selectedIndex === index ? "sw-flow-row-selected" : ""
            } ${locked ? "sw-flow-row-locked" : ""}`}
            style={{ paddingLeft: 8 + indent * 14 }}
            onClick={() => !locked && onSelect(index)}
            title={locked ? "Locked: this line has a parse error" : undefined}
          >
            <span className="sw-flow-badge" style={branchCaseBadgeStyle(row)}>
              {rowBadgeLabel(row)}
            </span>
            <span className="sw-flow-summary">{rowSummaryText(row, lanes)}</span>
          </li>
        );
      })}
    </ul>
  );
}
