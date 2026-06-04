/** Shared section / end-section geometry (parser, diagram, GUI). */

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

export function groupStartIndexForEnd(rows, rowIndex) {
  const row = rows[rowIndex];
  if (row?.kind !== "groupEnd") return -1;
  for (let j = rowIndex; j >= 0; j--) {
    if (rows[j].kind === "groupStart" && rows[j].id === row.id) return j;
  }
  return -1;
}

/** A group's mode: "section" (visual box) or "branch" (mid-flow sub-branch). */
export function groupModeOf(row) {
  // Default to "branch" so models serialized before the section/branch split
  // keep their original flow-skipping behavior.
  return row?.groupMode ?? "branch";
}

/** Innermost groupStart whose body strictly contains rowIndex. */
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

/**
 * Innermost enclosing "branch"-mode group. Only branch groups change the flow
 * (their steps leave the main line); "section" groups are visual boxes whose
 * steps stay on the main line, so they are transparent here.
 */
export function findEnclosingBranchGroupStart(rows, rowIndex) {
  if (rowIndex < 0) return -1;
  let best = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind !== "groupStart" || groupModeOf(rows[i]) !== "branch") continue;
    const endIdx = findGroupEndIndex(rows, i);
    if (endIdx < 0 || rowIndex <= i || rowIndex >= endIdx) continue;
    best = i;
  }
  return best;
}

/** True when rowIndex sits strictly inside a branch (flow) group. */
export function isInsideBranchGroup(rows, rowIndex) {
  return findEnclosingBranchGroupStart(rows, rowIndex) >= 0;
}

/** Last main-flow step immediately before a branch group. */
export function findLastMainFlowStepBeforeGroupStart(rows, groupStartIndex) {
  for (let j = groupStartIndex - 1; j >= 0; j--) {
    const row = rows[j];
    if (
      row.kind === "step" &&
      !row.empty &&
      row.role &&
      !isInsideBranchGroup(rows, j)
    ) {
      return j;
    }
    if (row.kind === "branchStart") break;
  }
  return -1;
}

/** True when rowIndex sits strictly inside a section … end-section span. */
export function isInsideGroup(rows, rowIndex) {
  return findEnclosingGroupStart(rows, rowIndex) >= 0;
}

/**
 * First main-flow step after groupEnd. Section groups are transparent (their
 * steps are main flow), so we skip over them and stop at an if/fork gateway.
 */
export function findNextMainFlowStepAfterGroupEnd(rows, groupEndIndex) {
  for (let j = groupEndIndex + 1; j < rows.length; j++) {
    const row = rows[j];
    if (row.kind === "branchStart") break;
    if (
      row.kind === "step" &&
      !row.empty &&
      row.role &&
      !isInsideBranchGroup(rows, j)
    ) {
      return j;
    }
  }
  return -1;
}

/**
 * Where a branch's merge arrow lands after the close: the very first block after
 * end-branch — which is the start block of a following group when one is there —
 * or the next if/fork gateway if that comes first. groupStart/groupEnd markers
 * are skipped so the arrow reaches the first real step inside a following group.
 */
export function findFlowContinuityAfterGroupEnd(rows, groupEndIndex) {
  for (let j = groupEndIndex + 1; j < rows.length; j++) {
    const row = rows[j];
    if (row.kind === "branchStart") return { type: "branch", index: j };
    if (row.kind === "step" && !row.empty && row.role) {
      return { type: "step", index: j };
    }
  }
  return null;
}
