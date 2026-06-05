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
import { EN, tr } from "../i18n.jsx";

/** English fallback translator for callers that don't pass one (e.g. tests). */
const defaultT = (key, vars) => tr(EN, key, vars);

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

/** True when a row is a reorderable step (non-blank, has a role). */
export function isStepRow(row) {
  return isReorderableStep(row);
}

/**
 * Indices of reorderable steps at the SAME branch-nesting level as `rowIndex`
 * (i.e. sharing the same directly-enclosing branch — not steps nested deeper in
 * a child branch). This keeps reordering from hopping across branch boundaries.
 */
export function getFrameStepIndices(rows, rowIndex) {
  const { frameStart, frameEnd } = getStepReorderFrame(rows, rowIndex);
  const enclosing = findEnclosingBranchStart(rows, rowIndex);
  const out = [];
  for (let i = frameStart; i <= frameEnd; i++) {
    if (isReorderableStep(rows[i]) && findEnclosingBranchStart(rows, i) === enclosing) {
      out.push(i);
    }
  }
  return out;
}

/** True when two indices are reorderable steps sharing one branch level. */
export function sameReorderFrame(rows, a, b) {
  if (!isReorderableStep(rows[a]) || !isReorderableStep(rows[b])) return false;
  return findEnclosingBranchStart(rows, a) === findEnclosingBranchStart(rows, b);
}

/**
 * Move the row at `from` so it lands at rows-index `to` (before whatever was
 * there). Returns a new array and the moved item's resulting index.
 */
export function moveRow(rows, from, to) {
  if (from === to) return { rows, index: from };
  const next = [...rows];
  const [item] = next.splice(from, 1);
  const insertAt = from < to ? to - 1 : to;
  next.splice(insertAt, 0, item);
  return { rows: next, index: insertAt };
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

export function stepBlockDisplayName(row, rowIndex = 0, t = defaultT) {
  const name = (row.name || "").trim();
  const text = (row.text || "").trim();
  return name || text || t("flow.stepN", { n: rowIndex + 1 });
}

function laneLabel(lanes, roleId, t = defaultT) {
  if (!roleId) return t("flow.noRole");
  const lane = (lanes || []).find((l) => l.id === roleId);
  return lane?.label || roleId;
}

const NAMED_LANE_COLORS = {
  blue: "#2563eb", green: "#16a34a", red: "#dc2626", orange: "#ea580c",
  purple: "#7c3aed", gray: "#6b7280", grey: "#6b7280", black: "#111827",
  teal: "#0d9488", yellow: "#ca8a04", pink: "#db2777",
};
function laneColorHex(value, roleId) {
  const k = String(value || "").trim().toLowerCase();
  if (NAMED_LANE_COLORS[k]) return NAMED_LANE_COLORS[k];
  if (/^#?[0-9a-fA-F]{3,8}$/.test(value || "")) return value.startsWith("#") ? value : `#${value}`;
  let h = 0;
  for (const ch of String(roleId || "role")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 60% 45%)`;
}
function contrastText(color) {
  const hsl = String(color).match(/hsl\(\s*\d+\s+\d+%\s+(\d+)%/);
  if (hsl) return Number(hsl[1]) > 62 ? "#111827" : "#ffffff";
  let hex = String(color).replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#111827" : "#ffffff";
}

/** Truncate by fullwidth units (CJK = 1, others = 0.5); cap defaults to 4. */
export function truncateFullwidth(s, max = 4) {
  const str = String(s ?? "");
  let w = 0;
  let out = "";
  for (const ch of str) {
    const fw = /[　-〿぀-ヿ㐀-鿿＀-￯가-힯]/.test(ch) ? 1 : 0.5;
    if (w + fw > max) return `${out}…`;
    w += fw;
    out += ch;
  }
  return out;
}

/** Role chip info for a step row: truncated label + background + contrasting text. */
export function rowLaneInfo(row, lanes, t = defaultT) {
  if (!row || row.kind !== "step" || row.empty || !row.role) return null;
  const lane = (lanes || []).find((l) => l.id === row.role);
  const bg = laneColorHex(lane?.bg, row.role);
  return {
    label: truncateFullwidth(laneLabel(lanes, row.role, t), 4),
    bg,
    fg: contrastText(bg),
  };
}

/** Localized type tag shown in the list badge. */
export function rowBadgeLabel(row, t = defaultT) {
  if (!row) return "";
  switch (row.kind) {
    case "step":
      return row.empty ? t("badge.blank") : t("badge.step");
    case "branchStart":
      return row.parallel ? t("badge.fork") : t("badge.if");
    case "branchCase":
      if (row.parallel) return t("badge.and");
      return /^else$/i.test((row.label || "").trim()) ? t("badge.else") : t("badge.case");
    case "branchEnd":
      return row.parallel ? t("badge.endfork") : t("badge.endif");
    case "branchLoop":
      return t("badge.loop");
    case "branchMerge":
      return t("badge.merge");
    case "groupStart":
      return (row.groupMode ?? "branch") === "branch" ? t("badge.branch") : t("badge.section");
    case "groupEnd":
      return (row.groupMode ?? "branch") === "branch" ? t("badge.endBranch") : t("badge.endSection");
    default:
      return t("badge.row");
  }
}

/**
 * Semantic color group for a row's badge, driving the `sw-badge-{kind}` class.
 * Keeps the step list visually scannable: control flow, parallelism, grouping,
 * and plain steps each read as their own color family.
 */
export function rowBadgeKind(row) {
  if (!row) return "default";
  switch (row.kind) {
    case "step":
      return row.empty ? "blank" : "step";
    case "branchStart":
      return row.parallel ? "fork" : "if";
    case "branchEnd":
      return row.parallel ? "fork" : "if";
    case "branchCase":
      if (row.parallel) return "fork";
      return /^else$/i.test((row.label || "").trim()) ? "else" : "case";
    case "branchLoop":
      return "loop";
    case "branchMerge":
      return "merge";
    case "groupStart":
    case "groupEnd":
      return "group";
    default:
      return "default";
  }
}

/** Lane label for a step row (used as a chip), or "" for non-steps / blanks. */
export function rowLaneLabel(row, lanes, t = defaultT) {
  if (!row || row.kind !== "step" || row.empty || !row.role) return "";
  return laneLabel(lanes, row.role, t);
}

export function rowSummaryText(row, lanes, t = defaultT) {
  if (!row) return "";
  switch (row.kind) {
    case "step": {
      if (row.empty) return t("flow.blankLine");
      return (row.name || row.text || "").trim() || t("flow.noText");
    }
    case "branchStart":
      return row.parallel ? t("flow.parallelFork") : (row.cond || "").trim() || t("flow.condition");
    case "branchCase":
      if (row.parallel) return t("flow.parallelPath");
      if (/^else$/i.test((row.label || "").trim())) return t("flow.otherwise");
      return (row.label || "").trim() || t("flow.case");
    case "branchEnd":
      return row.parallel ? t("flow.endParallel") : t("flow.endBranch");
    case "branchLoop":
      return t("flow.loopInBranch");
    case "branchMerge":
      return t("flow.mergeTo", { id: (row.mergeTarget || "").trim() || t("flow.unset") });
    case "groupStart":
      return (row.groupMode ?? "branch") === "branch" ? t("flow.subbranch") : t("flow.sectionBox");
    case "groupEnd":
      return (row.groupMode ?? "branch") === "branch" ? t("flow.endSubbranch") : t("flow.endSection");
    default:
      return "";
  }
}

/** Tiny muted meta suffix for a step (merge id / non-default arrow). */
export function rowStepMeta(row) {
  if (!row || row.kind !== "step" || row.empty) return "";
  const parts = [];
  if ((row.mergeId || "").trim()) parts.push(`#${row.mergeId.trim()}`);
  if (row.arrowLine && row.arrowLine !== "solid") parts.push(row.arrowLine);
  return parts.join(" · ");
}

/** Matches diagram case chips; uses row.branchColor key (blue, green, …). */
export function branchCaseBadgeStyle(row) {
  if (row.kind !== "branchCase" || !row.branchColor) return undefined;
  const palette = BRANCH_COLOR_STYLES[row.branchColor];
  if (!palette) return undefined;
  return {
    backgroundColor: palette.stroke,
    color: "#fff",
    borderColor: palette.stroke,
  };
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
