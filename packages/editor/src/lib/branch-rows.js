/**
 * Shared branch/group row geometry.
 *
 * Ported from the diagram-converter engine internals (`src/branch-rows.js`,
 * `src/group-rows.js`). The engine does not re-export these from its public
 * entry points, and the editor must only import from the public API, so the
 * pure functions are vendored here. Keep in sync with the engine if its row
 * model changes.
 */

// ---- group geometry ----

export function findGroupEndIndex(rows, startIndex) {
  const start = rows[startIndex];
  if (!start || start.kind !== "groupStart") return -1;
  let depth = 0;
  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind === "groupStart") depth += 1;
    if (row.kind === "groupEnd") {
      depth -= 1;
      if (depth === 0 && row.id === start.id) return i;
    }
  }
  return -1;
}

export function groupModeOf(row) {
  return row?.groupMode ?? "branch";
}

export function findEnclosingGroupStart(rows, rowIndex) {
  if (rowIndex < 0) return -1;
  let best = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind !== "groupStart") continue;
    const endIdx = findGroupEndIndex(rows, i);
    if (endIdx < 0 || rowIndex <= i || rowIndex >= endIdx) continue;
    best = i;
  }
  return best;
}

export function isInsideGroup(rows, rowIndex) {
  return findEnclosingGroupStart(rows, rowIndex) >= 0;
}

// ---- branch geometry ----

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
