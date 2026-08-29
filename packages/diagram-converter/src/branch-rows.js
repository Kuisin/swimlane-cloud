/** Shared branch row geometry (parser, diagram, GUI). */

import { isInsideBranchGroup } from "./group-rows.js";

export function findBranchEndIndex(rows, startIndex) {
  const start = rows[startIndex];
  if (!start || start.kind !== "branchStart") return -1;
  let depth = 0;
  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind === "branchStart") depth += 1;
    if (row.kind === "branchEnd") {
      depth -= 1;
      if (depth === 0 && row.id === start.id) return i;
    }
  }
  return -1;
}

export function branchStartIndexForEnd(rows, rowIndex) {
  const row = rows[rowIndex];
  if (row?.kind !== "branchEnd") return -1;
  for (let j = rowIndex; j >= 0; j--) {
    if (rows[j].kind === "branchStart" && rows[j].id === row.id) return j;
  }
  return -1;
}

/** Innermost open branchStart containing rowIndex (exclusive of branchEnd row). */
export function findEnclosingBranchStart(rows, rowIndex) {
  if (rowIndex < 0) return -1;
  let best = -1;
  for (let i = 0; i <= rowIndex; i++) {
    if (rows[i].kind !== "branchStart") continue;
    const endIdx = findBranchEndIndex(rows, i);
    if (endIdx < 0 || rowIndex >= endIdx) continue;
    best = i;
  }
  return best;
}

/** 0 for top-level if; +1 per nesting level. */
export function branchNestLevel(rows, branchStartIndex) {
  const anchor = branchStartIndex - 1;
  if (anchor < 0) return 0;

  if (rows[anchor]?.kind === "branchEnd") {
    const closedStart = branchStartIndexForEnd(rows, anchor);
    if (closedStart < 0) return 0;
    const outer = findEnclosingBranchStart(rows, closedStart - 1);
    if (outer < 0) return 0;
    return branchNestLevel(rows, outer) + 1;
  }

  const parent = findEnclosingBranchStart(rows, anchor);
  if (parent < 0) return 0;
  return branchNestLevel(rows, parent) + 1;
}

/** Next branchStart at the same nest level after afterRowIndex (skips deeper nested blocks). */
export function findNextSiblingBranchStart(rows, branchStartIndex, afterRowIndex) {
  const targetNest = branchNestLevel(rows, branchStartIndex);
  for (let j = afterRowIndex + 1; j < rows.length; j++) {
    const row = rows[j];
    if (row.kind === "branchStart") {
      if (branchNestLevel(rows, j) === targetNest) return j;
      const nestedEnd = findBranchEndIndex(rows, j);
      if (nestedEnd > j) j = nestedEnd;
      continue;
    }
    if (row.kind === "branchEnd") {
      const closedStart = branchStartIndexForEnd(rows, j);
      if (closedStart >= 0 && branchNestLevel(rows, closedStart) < targetNest) {
        return -1;
      }
    }
  }
  return -1;
}

/** Next non-empty step in the same branch frame as branchStart, after afterRowIndex. */
export function findNextFlowStepAfterBranchEnd(rows, branchStartIndex, afterRowIndex) {
  const branchParent = findEnclosingBranchStart(rows, branchStartIndex - 1);
  for (let j = afterRowIndex + 1; j < rows.length; j++) {
    const row = rows[j];
    if (row.kind === "branchStart") break;
    if (row.kind === "branchEnd") {
      const closedStart = branchStartIndexForEnd(rows, j);
      if (
        closedStart >= 0 &&
        branchNestLevel(rows, closedStart) <= branchNestLevel(rows, branchStartIndex)
      ) {
        break;
      }
      continue;
    }
    if (row.kind === "step" && !row.empty && row.role && !isInsideBranchGroup(rows, j)) {
      const stepParent = findEnclosingBranchStart(rows, j);
      if (stepParent === branchParent) return j;
    }
  }
  return -1;
}
