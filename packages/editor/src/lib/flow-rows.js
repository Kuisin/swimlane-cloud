/**
 * Flow row helpers for the GUI step list and inspectors.
 *
 * Ported from the reference `apps/txt-editor/src/lib/flow-rows.js`, with the
 * branch/group geometry primitives sourced from the vendored `./branch-rows`
 * (the engine keeps those internal). Only the helpers the editor GUI uses are
 * included; the move/reorder machinery is kept since the inspector relies on it.
 */
import { BRANCH_COLOR_STYLES } from "@swimlane-cloud/diagram-converter";
import {
  branchNestLevel,
  findBranchEndIndex,
  findEnclosingBranchStart,
  findGroupEndIndex,
} from "./branch-rows.js";

export { findBranchEndIndex, findEnclosingBranchStart, branchNestLevel, findGroupEndIndex };

/** Move branchStart.firstCase into a following branchCase row (GUI list shape). */
export function normalizeBranchRows(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (
      row.kind === "branchStart" &&
      !row.parallel &&
      (row.firstCase || "").trim()
    ) {
      const firstCase = row.firstCase.trim();
      const next = rows[i + 1];
      const alreadySplit =
        next?.kind === "branchCase" &&
        next.id === row.id &&
        (next.label || "").trim() === firstCase;
      out.push({ ...row, firstCase: "" });
      if (!alreadySplit) {
        out.push({
          kind: "branchCase",
          label: firstCase,
          branchColor: row.branchColor ?? null,
          id: row.id,
          depth: (row.depth ?? 0) + 1,
        });
      }
      continue;
    }
    out.push(row);
  }
  return normalizeBranchDepths(out);
}

export function branchMarkerDepthForRow(rows, rowIndex) {
  const anchor = Math.max(0, rowIndex - 1);
  const parent = findEnclosingBranchStart(rows, anchor);
  if (parent < 0) return 0;
  return branchNestLevel(rows, parent) + 1;
}

export function normalizeBranchDepths(rows) {
  const out = rows.map((row) => ({ ...row }));
  for (let i = 0; i < out.length; i++) {
    if (out[i].kind !== "branchStart") continue;
    const markerDepth = branchMarkerDepthForRow(out, i);
    const branchId = out[i].id;
    const endIdx = findBranchEndIndex(out, i);
    if (endIdx < 0) continue;

    const isParallel = Boolean(out[i].parallel);
    out[i] = { ...out[i], depth: markerDepth };
    if (out[endIdx].kind === "branchEnd" && out[endIdx].id === branchId) {
      out[endIdx] = { ...out[endIdx], depth: markerDepth, parallel: isParallel };
    }

    const caseDepth = markerDepth + 1;
    const bodyDepth = markerDepth + 1;
    for (let j = i + 1; j < endIdx; j++) {
      const row = out[j];
      if (row.kind === "branchStart" || row.kind === "branchEnd") continue;
      if (row.kind === "branchCase" && row.id === branchId) {
        out[j] = { ...row, depth: caseDepth, parallel: isParallel };
      } else if (
        (row.kind === "step" ||
          row.kind === "branchLoop" ||
          row.kind === "branchMerge") &&
        (row.depth ?? 0) < bodyDepth
      ) {
        out[j] = { ...row, depth: bodyDepth };
      }
    }
  }
  return out;
}

function findBranchStartForId(rows, rowIndex) {
  const row = rows[rowIndex];
  if (!row?.id) return -1;
  if (row.kind === "branchStart") return rowIndex;
  for (let j = rowIndex; j >= 0; j--) {
    if (rows[j].kind === "branchStart" && rows[j].id === row.id) return j;
  }
  return -1;
}

/**
 * GUI step list indent from branch nesting (not DSL export depth):
 * if/endif at 2n, cases at 2n+1, case body at 2n+2.
 */
export function rowListIndentDepth(rows, rowIndex) {
  const row = rows[rowIndex];
  if (row.kind === "branchStart") {
    return branchNestLevel(rows, rowIndex) * 2;
  }
  if (row.kind === "branchEnd") {
    const startIdx = findBranchStartForId(rows, rowIndex);
    if (startIdx < 0) return row.depth ?? 0;
    return branchNestLevel(rows, startIdx) * 2;
  }
  if (row.kind === "branchCase") {
    const startIdx = findBranchStartForId(rows, rowIndex);
    if (startIdx < 0) return row.depth ?? 0;
    return branchNestLevel(rows, startIdx) * 2 + 1;
  }
  if (
    row.kind === "step" ||
    row.kind === "branchLoop" ||
    row.kind === "branchMerge" ||
    row.kind === "groupStart" ||
    row.kind === "groupEnd"
  ) {
    const enclosing = findEnclosingBranchStart(rows, rowIndex);
    if (enclosing < 0) return row.depth ?? 0;
    return branchNestLevel(rows, enclosing) * 2 + 2;
  }
  return row.depth ?? 0;
}

/** Inclusive frame bounds for step reorder (between branch markers). */
export function getStepReorderFrame(rows, rowIndex) {
  const branchStart = findEnclosingBranchStart(rows, rowIndex);
  const frameStart = branchStart >= 0 ? branchStart : 0;
  const frameEnd =
    branchStart >= 0 ? findBranchEndIndex(rows, branchStart) : rows.length - 1;
  return { frameStart, frameEnd: frameEnd >= 0 ? frameEnd : rows.length - 1 };
}

function isReorderableStep(row) {
  return row?.kind === "step" && !row.empty && row.role;
}

function getStepReorderBounds(rows, rowIndex) {
  const { frameStart, frameEnd } = getStepReorderFrame(rows, rowIndex);
  let firstStep = -1;
  let lastStep = -1;
  for (let i = frameStart; i <= frameEnd; i++) {
    if (isReorderableStep(rows[i])) {
      if (firstStep < 0) firstStep = i;
      lastStep = i;
    }
  }
  return {
    canUp: firstStep >= 0 && rowIndex > firstStep,
    canDown: lastStep >= 0 && rowIndex < lastStep,
  };
}

export function getReorderBounds(rows, rowIndex) {
  const row = rows[rowIndex];
  if (!row || row.kind !== "step" || row.empty) {
    return { canUp: false, canDown: false };
  }
  return getStepReorderBounds(rows, rowIndex);
}

/** Nearest step row above/below index within the same branch frame. */
export function findAdjacentStepIndex(rows, rowIndex, direction) {
  const row = rows[rowIndex];
  if (!isReorderableStep(row)) return -1;
  const { frameStart, frameEnd } = getStepReorderFrame(rows, rowIndex);
  if (direction === "up") {
    for (let i = rowIndex - 1; i >= frameStart; i--) {
      if (isReorderableStep(rows[i])) return i;
    }
  } else {
    for (let i = rowIndex + 1; i <= frameEnd; i++) {
      if (isReorderableStep(rows[i])) return i;
    }
  }
  return -1;
}

export function swapStepRows(rows, indexA, indexB) {
  const next = [...rows];
  const tmp = next[indexA];
  next[indexA] = next[indexB];
  next[indexB] = tmp;
  return next;
}

/** When the user selects branchEnd, edit the paired branchStart in the inspector. */
export function resolveInspectorTarget(rows, rowIndex) {
  const row = rows?.[rowIndex];
  if (!row) {
    return { inspectorRow: null, saveRowIndex: -1, isBranchRow: false, viaBranchEnd: false };
  }
  if (row.kind === "branchEnd" || row.kind === "groupEnd") {
    const openKind = row.kind === "branchEnd" ? "branchStart" : "groupStart";
    const startIndex = rows.findIndex((r) => r.kind === openKind && r.id === row.id);
    if (startIndex >= 0) {
      return {
        inspectorRow: rows[startIndex],
        saveRowIndex: startIndex,
        isBranchRow: true,
        viaBranchEnd: true,
      };
    }
  }
  const isBranchRow = [
    "branchStart",
    "branchCase",
    "branchLoop",
    "branchMerge",
    "groupStart",
  ].includes(row.kind);
  return { inspectorRow: row, saveRowIndex: rowIndex, isBranchRow, viaBranchEnd: false };
}

export function stepBlockDisplayName(row, rowIndex = 0) {
  const name = (row.name || "").trim();
  const text = (row.text || "").trim();
  return name || text || `Step ${rowIndex + 1}`;
}

function laneLabel(lanes, roleId) {
  if (!roleId) return "(no role)";
  const lane = (lanes || []).find((l) => l.id === roleId);
  return lane?.label || roleId;
}

export function rowBadgeLabel(row) {
  if (!row) return "";
  switch (row.kind) {
    case "step":
      return row.empty ? "blank" : "step";
    case "branchStart":
      return row.parallel ? "fork" : "if";
    case "branchCase":
      if (row.parallel) return "and";
      return /^else$/i.test((row.label || "").trim()) ? "else" : "case";
    case "branchEnd":
      return row.parallel ? "endfork" : "endif";
    case "branchLoop":
      return "loop";
    case "branchMerge":
      return "merge";
    case "groupStart":
      return (row.groupMode ?? "branch") === "branch" ? "branch" : "section";
    case "groupEnd":
      return (row.groupMode ?? "branch") === "branch" ? "end-branch" : "end-section";
    default:
      return "row";
  }
}

export function rowSummaryText(row, lanes) {
  if (!row) return "";
  switch (row.kind) {
    case "step": {
      if (row.empty) return "(blank line)";
      const who = laneLabel(lanes, row.role);
      const title = (row.name || row.text || "").trim() || "(no text)";
      const idPart = (row.mergeId || "").trim() ? `id=${row.mergeId} · ` : "";
      const arrowPart =
        row.arrowLine && row.arrowLine !== "solid" ? `arrow=${row.arrowLine} · ` : "";
      return `${idPart}${arrowPart}${who}: ${title}`;
    }
    case "branchStart":
      return row.parallel ? "parallel (fork)" : (row.cond || "").trim() || "condition";
    case "branchCase":
      if (row.parallel) return "parallel path";
      if (/^else$/i.test((row.label || "").trim())) return "otherwise";
      return (row.label || "").trim() || "case";
    case "branchEnd":
      return row.parallel ? "end of parallel" : "end of branch";
    case "branchLoop":
      return "loop within branch";
    case "branchMerge":
      return `merge to id: ${(row.mergeTarget || "").trim() || "(unset)"}`;
    case "groupStart":
      return (row.groupMode ?? "branch") === "branch" ? "sub-branch" : "section box";
    case "groupEnd":
      return (row.groupMode ?? "branch") === "branch" ? "end of sub-branch" : "end of section";
    default:
      return "";
  }
}

/** Matches diagram case chips; uses row.branchColor key (blue, green, …). */
export function branchCaseBadgeStyle(row) {
  if (row.kind !== "branchCase" || !row.branchColor) return undefined;
  const palette = BRANCH_COLOR_STYLES[row.branchColor];
  if (!palette) return undefined;
  return { backgroundColor: palette.stroke };
}

export function collectMergeTargetOptions(rows) {
  const options = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind !== "step" || row.empty || !row.role) continue;
    const mergeId = (row.mergeId || "").trim();
    const blockName = stepBlockDisplayName(row, i);
    options.push({
      stepIndex: i,
      mergeId,
      blockName,
      label: mergeId ? `${blockName} (id: ${mergeId})` : blockName,
    });
  }
  return options;
}
