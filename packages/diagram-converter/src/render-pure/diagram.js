import {
  stringDisplayColumnWidth,
  truncate,
  truncateToColumns,
  wrapDescriptionToVisualLines,
  wrapTextToDisplayColumns,
} from "../utils.js";
import { buildStepRowDisplayInfo } from "../parser.js";
import { findNextFlowStepAfterBranchEnd, findNextSiblingBranchStart } from "../branch-rows.js";
import { arrowLineStrokeProps, stepOutgoingArrowLine } from "../arrow-line.js";
import { StepShape } from "./step-shape.js";
import { BlockIcon } from "./block-icon.js";
import { h, Fragment } from "./svg-utils.js";
import {
  findEnclosingBranchGroupStart,
  findFlowContinuityAfterGroupEnd,
  findGroupEndIndex,
  findLastMainFlowStepBeforeGroupStart,
  findNextMainFlowStepAfterGroupEnd,
  groupModeOf,
  isInsideBranchGroup,
} from "../group-rows.js";
import {
  BRANCH_COLOR_STYLES,
  DIAGRAM_LAYOUT,
  FORK_GATEWAY_RADIUS,
  blockMaxTextCols,
  decisionDiamondWidth,
  gutterTextCols,
} from "./diagram-layout.js";
/**
 * Wrapped multi-line gutter body text (step description / remark): one tspan
 * per visual line, with nested tspans for bold/italic/strike style runs.
 */
function GutterBodyText({ x, y, text, wrapCols, fill, opacity }) {
  const visualLines = wrapDescriptionToVisualLines(text, wrapCols);
  return /* @__PURE__ */ h(
    "text",
    {
      x,
      y,
      fill,
      opacity,
      fontFamily: "'Noto Sans JP',sans-serif",
      fontSize: String(DIAGRAM_LAYOUT.gutterBodyFontSize),
      fontWeight: "400",
    },
    visualLines.map((runs, li) =>
      /* @__PURE__ */ h(
        "tspan",
        {
          key: li,
          x,
          dy: li === 0 ? 0 : DIAGRAM_LAYOUT.descriptionLineHeight,
        },
        runs.map((run, ri) =>
          /* @__PURE__ */ h(
            "tspan",
            {
              key: ri,
              fontWeight: run.bold ? "600" : "400",
              fontStyle: run.italic ? "italic" : "normal",
              textDecoration: run.strike ? "line-through" : "none",
            },
            run.text,
          ),
        ),
      ),
    ),
  );
}
function PageTriColumnText({
  y,
  width,
  xPad,
  left,
  center,
  right,
  fill,
  fontSize = DIAGRAM_LAYOUT.triColumnFontSize,
}) {
  const fontFamily = DIAGRAM_LAYOUT.fontFamily;
  return /* @__PURE__ */ h(
    Fragment,
    null,
    left?.trim() &&
      /* @__PURE__ */ h(
        "text",
        {
          x: xPad,
          y,
          textAnchor: "start",
          fill,
          fontFamily,
          fontSize,
        },
        left.trim(),
      ),
    center?.trim() &&
      /* @__PURE__ */ h(
        "text",
        {
          x: width / 2,
          y,
          textAnchor: "middle",
          fill,
          fontFamily,
          fontSize,
        },
        center.trim(),
      ),
    right?.trim() &&
      /* @__PURE__ */ h(
        "text",
        {
          x: width - xPad,
          y,
          textAnchor: "end",
          fill,
          fontFamily,
          fontSize,
        },
        right.trim(),
      ),
  );
}
function RowSelectionHighlight({ x, y, w, h: height }) {
  return /* @__PURE__ */ h("rect", {
    "data-export-hide": true,
    x,
    y,
    width: w,
    height,
    fill: DIAGRAM_LAYOUT.selectionFill,
    fillOpacity: DIAGRAM_LAYOUT.selectionFillOpacity,
    stroke: DIAGRAM_LAYOUT.selectionFill,
    strokeWidth: DIAGRAM_LAYOUT.selectionStrokeWidth,
    rx: DIAGRAM_LAYOUT.selectionCornerRadius,
    pointerEvents: "none",
  });
}
function RowHitTarget({ rowIndex, x, y, w, h: height, selected, onSelect }) {
  return /* @__PURE__ */ h("rect", {
    "data-export-hide": true,
    "data-row-index": rowIndex,
    x,
    y,
    width: w,
    height,
    fill: "transparent",
    pointerEvents: "all",
    cursor: "pointer",
    stroke: selected ? DIAGRAM_LAYOUT.selectionFill : "none",
    strokeWidth: selected ? DIAGRAM_LAYOUT.hitTargetStrokeWidth : 0,
    rx: DIAGRAM_LAYOUT.hitTargetCornerRadius,
    onClick: (event) => {
      event.stopPropagation();
      onSelect?.(rowIndex);
    },
  });
}
function PathHitTarget({ rowIndex, d, onSelect }) {
  return /* @__PURE__ */ h("path", {
    "data-export-hide": true,
    "data-row-index": rowIndex,
    d,
    fill: "none",
    stroke: "transparent",
    strokeWidth: String(DIAGRAM_LAYOUT.pathHitStrokeWidth),
    pointerEvents: "stroke",
    cursor: "pointer",
    onClick: (event) => {
      event.stopPropagation();
      onSelect?.(rowIndex);
    },
  });
}
function PrintLayer({
  theme,
  page,
  title,
  width,
  xPad,
  hasPageHeader,
  pageHeaderY,
  titleY,
  pageDescLines,
  pageDescStartY,
  pageDescLineHeight,
  hasPageFooter,
  height,
}) {
  const serif = DIAGRAM_LAYOUT.fontFamily;
  return /* @__PURE__ */ h(
    Fragment,
    null,
    hasPageHeader &&
      pageHeaderY != null &&
      /* @__PURE__ */ h(PageTriColumnText, {
        y: pageHeaderY,
        width,
        xPad,
        left: page.headerLeft,
        center: page.headerCenter,
        right: page.headerRight,
        fill: theme.laneText || theme.title,
        fontSize: DIAGRAM_LAYOUT.triColumnFontSize,
      }),
    title &&
      titleY != null &&
      /* @__PURE__ */ h(
        "text",
        {
          x: width / 2,
          y: titleY,
          textAnchor: "middle",
          fill: theme.title,
          fontFamily: serif,
          fontSize: String(DIAGRAM_LAYOUT.titleFontSize),
          fontWeight: "600",
          letterSpacing: "0.05em",
        },
        title,
      ),
    pageDescLines.length > 0 &&
      pageDescStartY != null &&
      /* @__PURE__ */ h(
        "text",
        {
          x: width / 2,
          y: pageDescStartY,
          textAnchor: "middle",
          fill: theme.laneText || theme.title,
          fontFamily: serif,
          fontSize: String(DIAGRAM_LAYOUT.pageDescFontSize),
        },
        pageDescLines.map((line, i) =>
          /* @__PURE__ */ h(
            "tspan",
            { key: i, x: width / 2, dy: i === 0 ? 0 : pageDescLineHeight },
            line,
          ),
        ),
      ),
    hasPageFooter &&
      /* @__PURE__ */ h(PageTriColumnText, {
        y: height - DIAGRAM_LAYOUT.pageFooterTextY,
        width,
        xPad,
        left: page.footerLeft,
        center: page.footerCenter,
        right: page.footerRight,
        fill: theme.laneText || theme.title,
        fontSize: DIAGRAM_LAYOUT.triColumnFontSize,
      }),
  );
}
function renderDiagramSvg({
  model,
  theme,
  showStepBlockCaptions = true,
  mergeAtPreviousBlock = true,
  showLeftGutter = true,
  showRightGutter = true,
  showHeader = true,
  showFooter = true,
  showDescription = true,
  branchColorArrows = true,
  interactive = false,
  selectedRowIndex = null,
  onRowSelect,
}) {
  const { title, page = {}, lanes, rows, blocks = {}, props = {} } = model;
  const pageDescription = (showDescription ? page.description || "" : "").trim();
  const hasPageHeader = Boolean(
    showHeader &&
    (page.headerLeft?.trim() || page.headerCenter?.trim() || page.headerRight?.trim()),
  );
  const hasPageFooter = Boolean(
    showFooter &&
    (page.footerLeft?.trim() || page.footerCenter?.trim() || page.footerRight?.trim()),
  );
  const L = DIAGRAM_LAYOUT;
  const {
    xPad,
    leftGutterWidth,
    rightGutterWidth,
    remarkWrapColsMin,
    headerH,
    rowH,
    docW,
    docH,
    docGapX,
    docGapY,
    propRowExtraHBase,
    descriptionLineHeight,
    descriptionBottomPad,
    gutterTextBaselineY,
    gutterTitleLineH,
    gutterTextBandTopY,
    caseSpread,
    caseClearance,
    diamondH,
    mergeH,
    branchLoopH,
    branchMergeH,
    groupMarkerH,
    decisionYOffset,
    branchCaseBendYOffset,
    stepBoxH,
    loopDropPad,
    pageDescLineHeight,
    pageDescWrapCols,
    laneContentPad,
    baseBottomPadding: baseBottomPaddingBase,
    terminalGap,
    terminalRadius,
    startTerminalInset,
    endTerminalBottomPad,
    decisionDiamondH,
    mergeNodeW,
    mergeNodeH,
    sectionInset,
    outerLanePad,
    sectionEdgeInset,
    sectionNestStep,
    hitTargetPad,
    hitTargetDecisionPad,
    hitTargetMergePad,
    hitTargetMergeExtra,
    caseLabelOffsetY,
    caseLabelHeight,
    caseLabelPadX,
    caseLabelPadY,
    caseLabelGapBelow,
    caseLabelCharWidth,
    caseLaneSafeInset,
    branchConnectorElbowThreshold,
    mergeArrowClearance,
    caseCollisionShift,
    stepConnectorLabelOffsetY,
    stepDocIconOffsetY,
    propDefaultMaxChars,
    propDocFold,
    propDocTextY,
    propDocFontSize,
    stepPropRightExtentBase,
    stepPropLeftExtentBase,
    connectorBendMinGap,
    connectorBendMaxInset,
    connectorGroupBendMinGap,
    connectorGroupBendMaxInset,
    estimateTextWidthBase,
    estimateTextWidthHalfWidth,
    estimateTextWidthFullWidth,
    laneHeaderWidthWithIcon,
    laneHeaderWidthNoIcon,
    decisionTextOffsetY,
    gutterInnerPad,
    nodeW,
  } = L;
  const leftGutter = showLeftGutter ? leftGutterWidth : 0;
  const hasRemarks = (rows || []).some((r) => r.kind === "step" && (r.remark || "").trim());
  const rightGutterVisible = showRightGutter && hasRemarks;
  const rightGutter = rightGutterVisible ? rightGutterWidth : 0;
  const descWrapCols = gutterTextCols(leftGutterWidth, L.gutterBodyFontSize);
  const remarkWrapCols = Math.max(
    remarkWrapColsMin,
    gutterTextCols(rightGutterWidth, L.gutterBodyFontSize),
  );
  const propExtraWPerProps = docGapX;
  const propRowExtraHPerProps = docGapY;
  const loopRouteMargin = caseClearance;
  const pageDescLines = pageDescription
    ? wrapTextToDisplayColumns(pageDescription, pageDescWrapCols)
    : [];
  const pageFooterPad = hasPageFooter ? L.pageFooterPad : 0;
  const gridBottomPad = hasPageFooter ? L.gridBottomPadWithFooter : L.gridBottomPad;
  let pageHeaderY = null;
  let titleY = null;
  let pageDescStartY = null;
  let topPad = L.topPadDefault;
  if (!hasPageHeader && !pageDescription && title) {
    topPad = L.topPadWithTitleOnly;
    titleY = L.titleYWithTitleOnly;
  } else if (!hasPageHeader && !pageDescription && !title) {
    topPad = L.topPadDefault;
  } else {
    let layoutY = L.printLayoutStartY;
    if (hasPageHeader) {
      pageHeaderY = layoutY + L.pageHeaderTextOffset;
      layoutY += L.pageHeaderBlockHeight;
    }
    if (title) {
      titleY = layoutY + L.titleTextOffset;
      layoutY += L.titleBlockHeight;
    }
    if (pageDescLines.length > 0) {
      pageDescStartY = layoutY + L.pageDescStartOffset;
      layoutY += pageDescLines.length * pageDescLineHeight + L.pageDescBlockTrailing;
    }
    topPad = Math.max(
      layoutY + L.topPadTrailing,
      title || pageDescLines.length > 0 ? L.topPadMinWithTitle : L.topPadMinDefault,
    );
  }
  const rowMeta = [];
  let y = topPad + headerH + L.rowStartBelowHeader;
  const frames = [];
  const frameStack = [];
  const laneIndexById = new Map(lanes.map((lane, idx) => [lane.id, idx]));
  const stepRowDisplay = buildStepRowDisplayInfo(rows);
  const stepRowHeightByIndex = /* @__PURE__ */ new Map();
  function resolveBranchStyle(colorKey) {
    const custom = colorKey ? BRANCH_COLOR_STYLES[colorKey] : null;
    if (!custom) return { stroke: theme.branch, bg: theme.branchBg };
    return custom;
  }
  function branchDecisionCy(f) {
    return f.yDecision + diamondH / 2 + (f.parallel ? 0 : decisionYOffset);
  }
  function stepPropCounts(row) {
    const acc = { left: 0, right: 0 };
    (row?.props || []).forEach((propId) => {
      const side = props[propId]?.side === "left" ? "left" : "right";
      acc[side] += 1;
    });
    return acc;
  }
  function gutterTextExtraHeight(
    text,
    startOffset,
    rowIndex,
    heightWithProps,
    maxCols = descWrapCols,
  ) {
    const t = (text || "").trim();
    if (!t) return 0;
    const visualLines = wrapDescriptionToVisualLines(t, maxCols);
    if (visualLines.length === 0) return 0;
    const extent = startOffset + visualLines.length * descriptionLineHeight + descriptionBottomPad;
    let extra = Math.max(0, extent - heightWithProps);
    if (extra <= 0) return 0;
    const next = rows[rowIndex + 1];
    if (next?.kind === "branchStart") {
      extra = Math.max(0, extra - diamondH);
    }
    return extra;
  }
  function stepRowHeight(row, rowIndex) {
    if (!row || row.kind !== "step" || row.empty) return rowH;
    const counts = stepPropCounts(row);
    const maxPropsPerSide = Math.max(counts.left, counts.right);
    const propExtra =
      (maxPropsPerSide > 0 && propRowExtraHBase) +
      Math.max(0, maxPropsPerSide - 1) * propRowExtraHPerProps;
    const heightWithProps = rowH + propExtra;
    const titleText = (row.name || row.text || "").trim();
    const descExtra = showLeftGutter
      ? gutterTextExtraHeight(
          row.description,
          gutterTextBandTopY + (titleText ? gutterTitleLineH : 0),
          rowIndex,
          heightWithProps,
        )
      : 0;
    const remarkExtra = rightGutterVisible
      ? gutterTextExtraHeight(
          row.remark,
          gutterTextBandTopY,
          rowIndex,
          heightWithProps,
          remarkWrapCols,
        )
      : 0;
    return heightWithProps + Math.max(descExtra, remarkExtra);
  }
  function rowCenterY(rowIndex) {
    const yRow = rowMeta[rowIndex]?.y ?? 0;
    const h2 = stepRowHeightByIndex.get(rowIndex) || rowH;
    return yRow + h2 / 2;
  }
  function stepBlockCenterY(rowIndex) {
    const row = rows[rowIndex];
    if (row?.kind === "step") {
      const yRow = rowMeta[rowIndex]?.y ?? 0;
      return yRow + rowH / 2;
    }
    return rowCenterY(rowIndex);
  }
  function stepBlockBottomY(rowIndex) {
    const row = rows[rowIndex];
    if (!row || row.kind !== "step") {
      const yRow = rowMeta[rowIndex]?.y ?? 0;
      return yRow + (stepRowHeightByIndex.get(rowIndex) || rowH);
    }
    return stepBlockCenterY(rowIndex) + stepBoxH / 2;
  }
  function estimateTextWidth(text, base = estimateTextWidthBase) {
    if (!text) return base;
    let width2 = base;
    for (const ch of text)
      width2 += /[ -~]/.test(ch) ? estimateTextWidthHalfWidth : estimateTextWidthFullWidth;
    return width2;
  }
  function pushToActiveCase(rowIndex) {
    const frame = frameStack[frameStack.length - 1];
    if (!frame) return;
    const lastCase = frame.cases[frame.cases.length - 1];
    if (lastCase) lastCase.rowIndices.push(rowIndex);
  }
  rows.forEach((r, i) => {
    if (r.kind === "branchStart") {
      // v2 DSL emits an explicit `branchCase` row for a fork's own first path
      // (e.g. `fork (label)`), right after the `branchStart` row. v1 never
      // does — a v1 fork's first path has no row of its own, so the implicit
      // case below is still needed there. Synthesizing it unconditionally
      // (regardless of DSL version) double-counts the v2 fork's first path,
      // producing an extra, unlabeled, step-less rail in the rendered fork.
      const nextRow = rows[i + 1];
      const firstPathHasOwnRow =
        Boolean(r.parallel) && nextRow?.kind === "branchCase" && nextRow.id === r.id;
      const f = {
        id: r.id,
        depth: r.depth,
        cond: r.cond,
        parallel: Boolean(r.parallel),
        yDecision: y,
        decisionColor: r.branchColor || null,
        // A fork's first concurrent path opens at the `fork` line itself (no
        // condition/firstCase), mirroring how an `if` opens its first case —
        // unless the model already supplied that row (v2's labeled fork).
        cases: firstPathHasOwnRow
          ? []
          : r.parallel
            ? [
                {
                  label: "",
                  color: r.branchColor || null,
                  rowIndices: [],
                  startRow: i,
                },
              ]
            : r.firstCase && String(r.firstCase).trim()
              ? [
                  {
                    label: r.firstCase.trim(),
                    color: r.branchColor || null,
                    rowIndices: [],
                    startRow: i,
                  },
                ]
              : [],
        parentCase: null,
        anchorX: null,
      };
      if (frameStack.length > 0) {
        const parent = frameStack[frameStack.length - 1];
        const parentCase = parent.cases[parent.cases.length - 1];
        parentCase.childFrame = f;
        f.parentCase = parentCase;
      }
      frameStack.push(f);
      frames.push(f);
      rowMeta[i] = { y, kind: "decision" };
      y += diamondH;
    } else if (r.kind === "branchCase") {
      const f = frameStack[frameStack.length - 1];
      if (f)
        f.cases.push({
          label: r.label,
          color: r.branchColor || null,
          rowIndices: [],
          startRow: i,
        });
      rowMeta[i] = { y, kind: "case" };
    } else if (r.kind === "branchEnd") {
      const f = frameStack.pop();
      if (f) {
        f.yMerge = y;
        f.endRow = i;
      }
      rowMeta[i] = { y, kind: "merge" };
      y += mergeH;
    } else if (r.kind === "branchLoop") {
      stepRowHeightByIndex.set(i, branchLoopH);
      rowMeta[i] = { y, kind: "branchLoop" };
      pushToActiveCase(i);
      y += branchLoopH;
    } else if (r.kind === "branchMerge") {
      stepRowHeightByIndex.set(i, branchMergeH);
      rowMeta[i] = { y, kind: "branchMerge" };
      pushToActiveCase(i);
      y += branchMergeH;
    } else if (r.kind === "groupStart") {
      stepRowHeightByIndex.set(i, groupMarkerH);
      rowMeta[i] = { y, kind: "groupStart" };
      pushToActiveCase(i);
      y += groupMarkerH;
    } else if (r.kind === "groupEnd") {
      stepRowHeightByIndex.set(i, groupMarkerH);
      rowMeta[i] = { y, kind: "groupEnd" };
      pushToActiveCase(i);
      y += groupMarkerH;
    } else if (r.kind === "step") {
      const h2 = stepRowHeight(r, i);
      stepRowHeightByIndex.set(i, h2);
      rowMeta[i] = { y, kind: "step" };
      pushToActiveCase(i);
      y += h2;
    }
  });
  function caseHasDirectStep(c) {
    return c.rowIndices.some((idx) => {
      const row = rows[idx];
      return row?.kind === "step" && !row.empty && row.role;
    });
  }
  function firstDirectStepIdx(c) {
    return c.rowIndices.find((idx) => {
      const row = rows[idx];
      return row?.kind === "step" && !row.empty && row.role && !isInsideBranchGroup(rows, idx);
    });
  }
  function firstMainFlowStepIdx(c) {
    return firstDirectStepIdx(c);
  }
  function lastMainFlowStepIdx(c) {
    for (let k = c.rowIndices.length - 1; k >= 0; k--) {
      const idx = c.rowIndices[k];
      const row = rows[idx];
      if (row?.kind === "step" && !row.empty && row.role && !isInsideBranchGroup(rows, idx)) {
        return idx;
      }
    }
    return null;
  }
  function firstDirectStepAfterChild(c) {
    const child = c.childFrame;
    if (!child) return null;
    const childEndIdx =
      child.endRow ?? rows.findIndex((r) => r.kind === "branchEnd" && r.id === child.id);
    return c.rowIndices.find((idx) => {
      const row = rows[idx];
      return (
        row?.kind === "step" && !row.empty && row.role && (childEndIdx < 0 || idx > childEndIdx)
      );
    });
  }
  function firstStepIdxInCase(c) {
    return c.rowIndices.find((idx) => rows[idx]?.kind === "step");
  }
  function lastStepIdxInCase(c) {
    for (let k = c.rowIndices.length - 1; k >= 0; k--) {
      const idx = c.rowIndices[k];
      if (rows[idx]?.kind === "step") return idx;
    }
    return null;
  }
  function caseStepLineTarget(stepIdx, caseHint) {
    const row = rows[stepIdx];
    if (!row || row.kind !== "step") return null;
    if (row.empty) {
      const c = caseHint ?? findCaseForStep(stepIdx);
      return {
        x: c ? caseAnchorX(c) : width / 2,
        y: stepBlockCenterY(stepIdx),
        showArrow: false,
      };
    }
    if (!row.role) return null;
    const li = laneIndex(row.role);
    return {
      x: li >= 0 ? nodeCenterX(stepIdx, row.role) : width / 2,
      y: stepBlockCenterY(stepIdx) - 22,
      showArrow: true,
    };
  }
  /**
   * Position + width for a branch/fork case label chip, shared by the drawn
   * chip and its click target so the two can never drift apart. `dH` (the
   * gateway's half-height) is parallel-aware: a fork's gateway is a
   * FORK_GATEWAY_RADIUS*2 circle, shorter than an `if`'s decisionDiamondH
   * diamond, so treating both the same left a fork's label almost touching
   * the block below it. The result is also clamped upward (never pushed
   * down) so the label's drawn bottom edge keeps at least caseLabelGapBelow
   * clearance from whatever it points at.
   */
  function caseLabelPosition(f, c) {
    const dCy = branchDecisionCy(f);
    const dH = f.parallel ? FORK_GATEWAY_RADIUS * 2 : decisionDiamondH;
    const startY = dCy + dH / 2;
    const bendY = startY + branchCaseBendYOffset;
    let labelY = bendY + caseLabelOffsetY;
    let targetX = c.x;
    let targetY = null;
    const firstStepIdx = firstStepIdxInCase(c);
    if (firstStepIdx != null) {
      const stepTarget = caseStepLineTarget(firstStepIdx, c);
      if (stepTarget) {
        targetX = stepTarget.x;
        targetY = stepTarget.y;
      } else {
        targetY = stepBlockCenterY(firstStepIdx) - 22;
      }
    } else if (f.yMerge != null) {
      targetY = f.yMerge + mergeH / 2 - mergeNodeH / 2 - mergeArrowClearance;
    }
    if (targetY != null) {
      const labelBottomOffset = caseLabelHeight - caseLabelPadY;
      labelY = Math.min(labelY, targetY - caseLabelGapBelow - labelBottomOffset);
    }
    return {
      labelX: targetX,
      labelY,
      labelW: (stringDisplayColumnWidth(c.label || "") + 2) * caseLabelCharWidth,
    };
  }
  function caseStepLineSource(stepIdx, caseHint) {
    const row = rows[stepIdx];
    if (!row || row.kind !== "step") return null;
    if (row.empty) {
      const c = caseHint ?? findCaseForStep(stepIdx);
      return {
        x: c ? caseAnchorX(c) : width / 2,
        y: stepBlockCenterY(stepIdx) + stepConnectorLabelOffsetY,
      };
    }
    if (!row.role) return null;
    const li = laneIndex(row.role);
    return {
      x: li >= 0 ? nodeCenterX(stepIdx, row.role) : width / 2,
      y: stepBlockCenterY(stepIdx) + 22,
    };
  }
  function caseMergeAnchor(c) {
    const childFrame = c.childFrame;
    if (childFrame?.yMerge != null) {
      const childEndIdx =
        childFrame.endRow ??
        rows.findIndex((r) => r.kind === "branchEnd" && r.id === childFrame.id);
      const stepsAfterChild = c.rowIndices.filter(
        (idx) => rows[idx]?.kind === "step" && (childEndIdx < 0 || idx > childEndIdx),
      );
      const lastAfterChild = stepsAfterChild[stepsAfterChild.length - 1];
      if (lastAfterChild != null) {
        const src = caseStepLineSource(lastAfterChild, c);
        if (src) return { fromX: src.x, fromY: src.y };
      }
      return {
        fromX: mergeAnchorX(childFrame),
        fromY: childFrame.yMerge + mergeH / 2 - 14,
      };
    }
    const lastDirectStepIdx = lastMainFlowStepIdx(c);
    if (lastDirectStepIdx != null) {
      const r = rows[lastDirectStepIdx];
      const li = laneIndex(r.role);
      return {
        fromX: li >= 0 ? nodeCenterX(lastDirectStepIdx, r.role) : caseAnchorX(c),
        fromY: stepBlockCenterY(lastDirectStepIdx) + 22,
      };
    }
    const lastAnyStepIdx = lastStepIdxInCase(c);
    if (lastAnyStepIdx != null) {
      const src = caseStepLineSource(lastAnyStepIdx);
      if (src) return { fromX: src.x, fromY: src.y };
    }
    return null;
  }
  function resolveCaseLane(c) {
    const stepIdx = firstDirectStepIdx(c);
    if (stepIdx != null) return rows[stepIdx].role;
    if (c.childFrame) {
      for (const nc of c.childFrame.cases) {
        const lane = resolveCaseLane(nc);
        if (lane) return lane;
      }
    }
    return null;
  }
  function caseTouchesLane(c, laneId) {
    for (const idx of c.rowIndices) {
      const row = rows[idx];
      if (row?.kind === "step" && !row.empty && row.role === laneId) return true;
    }
    if (c.childFrame) {
      for (const nc of c.childFrame.cases) {
        if (caseTouchesLane(nc, laneId)) return true;
      }
    }
    return false;
  }
  const frameCaseOffsets = /* @__PURE__ */ new Map();
  const frameSubtreeExtent = /* @__PURE__ */ new Map();
  function computeFrameLayout(frame) {
    frame.cases.forEach((c) => {
      if (c.childFrame) computeFrameLayout(c.childFrame);
    });
    const casesByLane = /* @__PURE__ */ new Map();
    frame.cases.forEach((c, caseIdx) => {
      for (const lane of lanes) {
        if (!caseTouchesLane(c, lane.id)) continue;
        const list = casesByLane.get(lane.id) || [];
        if (!list.includes(caseIdx)) list.push(caseIdx);
        casesByLane.set(lane.id, list);
      }
    });
    const offsets = /* @__PURE__ */ new Map();
    const extents = {};
    for (const lane of lanes) extents[lane.id] = { min: 0, max: 0 };
    casesByLane.forEach((indices, laneId) => {
      const caseExtents = indices.map((ci) => {
        const c = frame.cases[ci];
        let mn = 0;
        let mx = 0;
        for (const stepIdx of c.rowIndices) {
          const row = rows[stepIdx];
          if (row?.kind === "step" && !row.empty && row.role === laneId) {
            mn = Math.min(mn, stepLeftVisualExtent(row));
            mx = Math.max(mx, stepRightVisualExtent(row));
          }
        }
        if (c.childFrame) {
          const childExt = frameSubtreeExtent.get(c.childFrame.id)?.[laneId];
          if (childExt) {
            mn = Math.min(mn, childExt.min);
            mx = Math.max(mx, childExt.max);
          }
        }
        return { mn, mx };
      });
      const n = indices.length;
      const pos = new Array(n);
      if (n === 1) {
        pos[0] = 0;
      } else {
        pos[0] = 0;
        for (let k = 1; k < n; k++) {
          pos[k] = pos[k - 1] + caseClearance + Math.max(caseExtents[k - 1].mx, -caseExtents[k].mn);
        }
        let minOverall = Infinity;
        let maxOverall = -Infinity;
        for (let k = 0; k < n; k++) {
          minOverall = Math.min(minOverall, pos[k] + caseExtents[k].mn);
          maxOverall = Math.max(maxOverall, pos[k] + caseExtents[k].mx);
        }
        const mid = (minOverall + maxOverall) / 2;
        for (let k = 0; k < n; k++) pos[k] -= mid;
      }
      indices.forEach((ci, k) => offsets.set(`${ci}-${laneId}`, pos[k]));
      let mnAll = Infinity;
      let mxAll = -Infinity;
      indices.forEach((ci, k) => {
        mnAll = Math.min(mnAll, pos[k] + caseExtents[k].mn);
        mxAll = Math.max(mxAll, pos[k] + caseExtents[k].mx);
      });
      extents[laneId] = { min: mnAll, max: mxAll };
    });
    frameCaseOffsets.set(frame.id, offsets);
    frameSubtreeExtent.set(frame.id, extents);
  }
  for (const f of frames) {
    if (!f.parentCase) computeFrameLayout(f);
  }
  const stepOffsetByIndex = /* @__PURE__ */ new Map();
  function fillStepOffsets(frame, inheritedByLane) {
    const inherited = inheritedByLane || Object.fromEntries(lanes.map((lane) => [lane.id, 0]));
    const offsets = frameCaseOffsets.get(frame.id);
    const co = (ci, lid) => offsets?.get(`${ci}-${lid}`) || 0;
    frame.cases.forEach((c, caseIdx) => {
      c.rowIndices.forEach((stepIdx) => {
        const row = rows[stepIdx];
        if (row?.kind === "step" && !row.empty && row.role) {
          stepOffsetByIndex.set(stepIdx, (inherited[row.role] || 0) + co(caseIdx, row.role));
        }
      });
      if (c.childFrame) {
        const childInherited = { ...inherited };
        for (const lane of lanes) {
          childInherited[lane.id] = (childInherited[lane.id] || 0) + co(caseIdx, lane.id);
        }
        fillStepOffsets(c.childFrame, childInherited);
      }
    });
  }
  for (const f of frames) {
    if (!f.parentCase) fillStepOffsets(f, null);
  }
  function stepPropSideCounts(row) {
    const left = [];
    const right = [];
    (row?.props || []).forEach((propId) => {
      const prop = props[propId] || { id: propId, side: "right" };
      if (prop.side === "left") left.push(prop);
      else right.push(prop);
    });
    return { left: left.length, right: right.length };
  }
  function stepRightExtent(row) {
    const { right: n } = stepPropSideCounts(row);
    if (n === 0) return nodeW / 2;
    return nodeW / 2 - 60 + (n - 2) * propExtraWPerProps + docW;
  }
  function stepLeftExtent() {
    return -nodeW / 2;
  }
  function stepRightVisualExtent(row) {
    const { right: n } = stepPropSideCounts(row);
    if (n === 0) return nodeW / 2;
    return Math.max(nodeW / 2, nodeW / 2 - stepPropRightExtentBase + (n - 1) * docGapX + docW);
  }
  function stepLeftVisualExtent(row) {
    const { left: n } = stepPropSideCounts(row);
    if (n === 0) return -nodeW / 2;
    return Math.min(-nodeW / 2, -nodeW / 2 + stepPropLeftExtentBase - docW);
  }
  const branchShiftGap = caseClearance;
  rows.forEach((row, startIdx) => {
    if (row.kind !== "groupStart" || groupModeOf(row) !== "branch") return;
    const endIdx = findGroupEndIndex(rows, startIdx);
    if (endIdx < 0) return;
    const prevMain = findLastMainFlowStepBeforeGroupStart(rows, startIdx);
    const refIdx = prevMain >= 0 ? prevMain : findNextMainFlowStepAfterGroupEnd(rows, endIdx);
    if (refIdx < 0) return;
    const bypassLane = rows[refIdx].role;
    if (laneIndexById.get(bypassLane) == null) return;
    const conflicting = [];
    for (let j = startIdx + 1; j < endIdx; j++) {
      const r = rows[j];
      if (r?.kind !== "step" || r.empty || r.role !== bypassLane) continue;
      if (findEnclosingBranchGroupStart(rows, j) !== startIdx) continue;
      conflicting.push(j);
    }
    if (conflicting.length === 0) return;
    let minLeft = stepLeftExtent();
    for (const j of conflicting) {
      minLeft = Math.min(minLeft, stepLeftVisualExtent(rows[j]));
    }
    const refOffset = stepOffsetByIndex.get(refIdx) || 0;
    const shift = refOffset + branchShiftGap - minLeft;
    for (const j of conflicting) {
      stepOffsetByIndex.set(j, (stepOffsetByIndex.get(j) || 0) + shift);
    }
  });
  const stepEdgesByLane = /* @__PURE__ */ new Map();
  rows.forEach((row, i) => {
    if (row.kind !== "step" || row.empty || !row.role) return;
    const off = stepOffsetByIndex.get(i) || 0;
    const left = off + stepLeftExtent();
    const right = off + stepRightExtent(row);
    const cur = stepEdgesByLane.get(row.role);
    if (!cur) stepEdgesByLane.set(row.role, { min: left, max: right });
    else
      stepEdgesByLane.set(row.role, {
        min: Math.min(cur.min, left),
        max: Math.max(cur.max, right),
      });
  });
  const loopRailAllowance = caseClearance;
  rows.forEach((row, i) => {
    if (row.kind !== "branchLoop") return;
    let srcLane = -1;
    for (let j = i - 1; j >= 0; j--) {
      const r = rows[j];
      if (r.kind === "step" && !r.empty && r.role) {
        srcLane = laneIndexById.get(r.role) ?? -1;
        break;
      }
      if (r.kind === "branchStart" && r.id === row.loopBranchId) break;
    }
    if (srcLane < 0) srcLane = 0;
    const routesLeft = srcLane <= (lanes.length - 1) / 2;
    const laneId = routesLeft ? lanes[0]?.id : lanes[lanes.length - 1]?.id;
    const edge = laneId != null ? stepEdgesByLane.get(laneId) : null;
    if (!edge) return;
    if (routesLeft) edge.min -= loopRailAllowance;
    else edge.max += loopRailAllowance;
  });
  const laneWidths = lanes.map((lane) => {
    const headerWidth = estimateTextWidth(
      lane.label || lane.id,
      lane.icon ? laneHeaderWidthWithIcon : laneHeaderWidthNoIcon,
    );
    const maxStepWidth = rows.reduce((maxWidth, row) => {
      if (row.kind !== "step" || row.role !== lane.id || row.empty) return maxWidth;
      const stepWidth = estimateTextWidth(row.text, 68);
      return Math.max(maxWidth, stepWidth);
    }, 0);
    const edges = stepEdgesByLane.get(lane.id);
    const extentWidth = edges ? edges.max - edges.min + laneContentPad * 2 : 0;
    return Math.max(headerWidth, maxStepWidth, extentWidth);
  });
  // Deepest section nesting in the whole diagram. Each level insets the section
  // border by sectionNestStep, so the outer lanes must reserve that much extra
  // room (plus the base padding) to keep the innermost border off the arrows.
  let maxSectionDepth = 0;
  {
    let depth = 0;
    for (const row of rows) {
      if (row.kind === "groupStart" && groupModeOf(row) === "section") {
        depth++;
        if (depth > maxSectionDepth) maxSectionDepth = depth;
      } else if (row.kind === "groupEnd" && depth > 0) {
        depth--;
      }
    }
  }
  const hasSections = maxSectionDepth > 0;
  // Padding added to the left of the first lane and the right of the last lane.
  // Scales with nesting depth so deeply-nested section borders + the side rails
  // never collide.
  const outerPad = hasSections
    ? outerLanePad + sectionEdgeInset + maxSectionDepth * sectionNestStep
    : 0;
  const laneOffsets = [];
  let laneCursor = xPad + leftGutter + outerPad;
  laneWidths.forEach((w, idx) => {
    laneOffsets[idx] = laneCursor;
    laneCursor += w;
  });
  const rightGutterX = laneCursor + outerPad;
  const width = rightGutterX + rightGutter + xPad;
  const baseBottomPadding = baseBottomPaddingBase + pageFooterPad;
  function stepRowBounds(rowIndex) {
    const row = rows[rowIndex];
    const meta = rowMeta[rowIndex];
    if (!row || !meta || row.kind !== "step" || row.empty || !row.role) {
      return null;
    }
    return {
      x: xPad,
      y: meta.y,
      w: width - xPad * 2,
      h: stepRowHeightByIndex.get(rowIndex) ?? stepRowHeight(row, rowIndex),
    };
  }
  const laneIndex = (id) => laneIndexById.get(id) ?? -1;
  const laneX = (i) => laneOffsets[i] ?? xPad + leftGutter;
  const laneWidth = (i) => laneWidths[i] ?? nodeW + laneContentPad * 2;
  const laneCenter = (i) => {
    const lane = lanes[i];
    if (!lane) return laneX(i) + laneWidth(i) / 2;
    const edges = stepEdgesByLane.get(lane.id);
    const branchMin = edges?.min ?? -nodeW / 2;
    const branchMax = edges?.max ?? nodeW / 2;
    return laneX(i) + laneWidth(i) / 2 - (branchMin + branchMax) / 2;
  };
  function caseAnchorX(c) {
    return (c.x ?? width / 2) + (c.offset || 0);
  }
  function findCaseForStep(stepIdx) {
    function searchFrame(frame) {
      for (const c of frame.cases) {
        if (c.rowIndices.includes(stepIdx)) return c;
        if (c.childFrame) {
          const hit = searchFrame(c.childFrame);
          if (hit) return hit;
        }
      }
      return null;
    }
    for (const f of frames) {
      const hit = searchFrame(f);
      if (hit) return hit;
    }
    return null;
  }
  function isStubCase(c, branchId) {
    if (loopAnchorInCase(c.rowIndices, branchId)) return false;
    if (c.childFrame) return false;
    return firstStepIdxInCase(c) == null;
  }
  function forkFirstBlockX(f) {
    const startIdx = rows.findIndex((r) => r.kind === "branchStart" && r.id === f.id);
    if (startIdx < 0) return null;
    for (let j = startIdx + 1; j < rows.length; j++) {
      const row = rows[j];
      if (row.kind === "branchEnd" && row.id === f.id) break;
      if (row.kind === "step" && !row.empty && row.role && !isInsideBranchGroup(rows, j)) {
        return nodeCenterX(j, row.role);
      }
    }
    return null;
  }
  function frameAnchorX(f) {
    if (f.parallel && mergeAtPreviousBlock) {
      const fx = forkFirstBlockX(f);
      if (fx != null) return fx;
    }
    const startIdx = rows.findIndex((r) => r.kind === "branchStart" && r.id === f.id);
    if (startIdx > 0) {
      for (let j = startIdx - 1; j >= 0; j--) {
        const row = rows[j];
        if (row.kind === "step" && !row.empty && row.role && !isInsideBranchGroup(rows, j)) {
          return nodeCenterX(j, row.role);
        }
        if (row.kind === "branchCase" && row.depth != null && row.depth < (f.depth ?? 0)) break;
        if (row.kind === "branchStart" && row.depth < (f.depth ?? 0)) break;
        if (row.kind === "branchEnd") break;
      }
    }
    if (f.parentCase) return caseAnchorX(f.parentCase);
    const first = f.cases[0];
    return first ? caseAnchorX(first) : width / 2;
  }
  function mergeAnchorX(f) {
    if (!mergeAtPreviousBlock) return frameAnchorX(f);
    const endIdx = rows.findIndex((r) => r.kind === "branchEnd" && r.id === f.id);
    if (endIdx < 0) return frameAnchorX(f);
    for (let j = endIdx - 1; j >= 0; j--) {
      const row = rows[j];
      if (row.kind === "step" && !row.empty && row.role && !isInsideBranchGroup(rows, j)) {
        return nodeCenterX(j, row.role);
      }
      if (row.kind === "branchEnd" && row.id !== f.id) {
        const nestedFrame = frames.find((fr) => fr.id === row.id);
        if (nestedFrame) return mergeAnchorX(nestedFrame);
      }
      if (row.kind === "branchStart" && row.id === f.id) break;
    }
    return frameAnchorX(f);
  }
  function laneIndexForX(x) {
    for (let li = 0; li < lanes.length; li++) {
      if (x >= laneX(li) && x <= laneX(li) + laneWidth(li)) return li;
    }
    return -1;
  }
  frames.forEach((f) => {
    f.cases.forEach((c) => {
      const firstStep = firstDirectStepIdx(c);
      if (firstStep != null) {
        const row = rows[firstStep];
        const li = laneIndex(row.role);
        c.x = li >= 0 ? laneCenter(li) : width / 2;
      } else {
        c.x = width / 2;
      }
    });
    const usedX = {};
    f.cases.forEach((c, idx) => {
      const key = Math.round(c.x);
      if (usedX[key] != null) {
        c.x = c.x + (idx - f.cases.length / 2) * caseCollisionShift;
      }
      usedX[key] = idx;
    });
  });
  function buildCaseFanOutEdgeD(f, c) {
    const dCx = frameAnchorX(f);
    const dCy = branchDecisionCy(f);
    const dH = f.parallel ? FORK_GATEWAY_RADIUS * 2 : decisionDiamondH;
    const mCy = f.yMerge + mergeH / 2;
    const mH = f.parallel ? FORK_GATEWAY_RADIUS * 2 : mergeNodeH;
    const child = c.childFrame;
    const firstMainStep = firstMainFlowStepIdx(c);
    const firstStepIdx = firstMainStep ?? firstStepIdxInCase(c);
    const childStartIdx =
      child != null ? rows.findIndex((r) => r.kind === "branchStart" && r.id === child.id) : -1;
    const stubCase = isStubCase(c, f.id);
    const targetsNestedDecision =
      child != null &&
      (firstMainStep == null || (childStartIdx >= 0 && childStartIdx < firstMainStep));
    const startX = dCx;
    const startY = dCy + dH / 2;
    const bendY = startY + branchCaseBendYOffset;
    let targetY;
    let targetX = caseAnchorX(c);
    let caseLaneWidth = nodeW + laneContentPad * 2;
    let showArrow = false;
    if (targetsNestedDecision) {
      targetX = frameAnchorX(child);
      targetY = branchDecisionCy(child) - 22;
      const li = laneIndexForX(targetX);
      if (li >= 0) caseLaneWidth = laneWidth(li);
    } else if (firstStepIdx != null) {
      const stepTarget = caseStepLineTarget(firstStepIdx, c);
      if (stepTarget) {
        targetX = stepTarget.x;
        targetY = stepTarget.y;
        showArrow = stepTarget.showArrow;
        const li = laneIndexForX(targetX);
        if (li >= 0) caseLaneWidth = laneWidth(li);
      } else {
        targetY = bendY;
      }
    } else if (stubCase) {
      targetX = caseAnchorX(c);
      targetY = bendY;
    } else {
      targetY = mCy - mH / 2 - mergeArrowClearance;
    }
    const sideOffset = c.offset || 0;
    const sideX = targetX;
    const laneSafeMin = targetX - caseLaneWidth / 2 + caseLaneSafeInset;
    const laneSafeMax = targetX + caseLaneWidth / 2 - caseLaneSafeInset;
    const clampedSideX = Math.max(laneSafeMin, Math.min(laneSafeMax, sideX));
    const needsElbow =
      Math.abs(targetX - startX) > branchConnectorElbowThreshold || (showArrow && sideOffset !== 0);
    return showArrow && sideOffset !== 0
      ? `M ${startX} ${startY} L ${startX} ${bendY} L ${clampedSideX} ${bendY} L ${clampedSideX} ${targetY}`
      : needsElbow
        ? `M ${startX} ${startY} L ${startX} ${bendY} L ${targetX} ${bendY} L ${targetX} ${targetY}`
        : `M ${startX} ${startY} L ${targetX} ${targetY}`;
  }
  const stepRows = rows
    .map((r, i) => ({ r, i, y: rowMeta[i]?.y, meta: rowMeta[i] }))
    .filter((x) => x.r.kind === "step" && !x.r.empty && x.r.role);
  const connectors = [];
  function caseOfStep(stepIdx) {
    let matched = null;
    for (const f of frames) {
      for (let ci = 0; ci < f.cases.length; ci++) {
        if (f.cases[ci].rowIndices.includes(stepIdx)) matched = { frame: f, caseIdx: ci };
      }
    }
    return matched;
  }
  function loopAnchorInCase(rowIndices, branchId) {
    const loopIdx = [...rowIndices]
      .reverse()
      .find((idx) => rows[idx]?.kind === "branchLoop" && rows[idx].loopBranchId === branchId);
    if (loopIdx == null) return null;
    const prevStepIdx = [...rowIndices]
      .filter((idx) => idx < loopIdx)
      .reverse()
      .find((idx) => rows[idx]?.kind === "step" && !rows[idx].empty && rows[idx].role);
    return { loopIdx, prevStepIdx: prevStepIdx ?? null };
  }
  function findStepIndexByMergeId(mergeId) {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.kind === "step" && !r.empty && r.role && r.mergeId === mergeId) return i;
    }
    return -1;
  }
  function mergeAnchorInCase(rowIndices, branchId) {
    const mergeIdx = [...rowIndices]
      .reverse()
      .find((idx) => rows[idx]?.kind === "branchMerge" && rows[idx].mergeBranchId === branchId);
    if (mergeIdx == null) return null;
    let prevStepIdx = null;
    for (const idx of rowIndices) {
      if (idx < mergeIdx && rows[idx]?.kind === "step" && !rows[idx].empty && rows[idx].role)
        prevStepIdx = idx;
    }
    const targetIdx = findStepIndexByMergeId(rows[mergeIdx].mergeTarget);
    if (targetIdx < 0) return null;
    return { mergeIdx, prevStepIdx, targetIdx };
  }
  function buildMergeForwardPath({ fromX, fromBottomY, targetIdx }) {
    const targetCenterX = nodeCenterX(targetIdx, rows[targetIdx].role);
    const targetCenterY = stepBlockCenterY(targetIdx);
    const dropY = fromBottomY + loopDropPad;
    const obstacles = [];
    rows.forEach((row, idx) => {
      if (idx === targetIdx) return;
      if (row?.kind !== "step" || row.empty || !row.role) return;
      const b = stepObstacleBounds(idx);
      if (b.bottom >= dropY && b.top <= targetCenterY) obstacles.push(b);
    });
    let sideSign;
    if (obstacles.length > 0) {
      const minLeft = Math.min(...obstacles.map((o) => o.left));
      const maxRight = Math.max(...obstacles.map((o) => o.right));
      const spaceLeft = fromX - minLeft;
      const spaceRight = maxRight - fromX;
      sideSign = spaceRight >= spaceLeft ? 1 : -1;
    } else {
      sideSign = targetCenterX >= fromX ? 1 : -1;
    }
    let routeX;
    if (sideSign < 0) {
      routeX = Math.min(fromX, targetCenterX, ...obstacles.map((o) => o.left)) - loopRouteMargin;
    } else {
      routeX = Math.max(fromX, targetCenterX, ...obstacles.map((o) => o.right)) + loopRouteMargin;
    }
    const lastLaneIdx = lanes.length - 1;
    const laneGridLeft = laneX(0);
    const laneGridRight =
      lastLaneIdx >= 0 ? laneX(lastLaneIdx) + laneWidth(lastLaneIdx) : width - xPad;
    routeX = Math.max(laneGridLeft, Math.min(laneGridRight, routeX));
    const toSideX = sideSign < 0 ? targetCenterX - nodeW / 2 : targetCenterX + nodeW / 2;
    const toY = targetCenterY;
    if (Math.abs(fromX - routeX) < branchConnectorElbowThreshold) {
      return `M ${fromX} ${fromBottomY} L ${fromX} ${dropY} L ${routeX} ${toY} L ${toSideX} ${toY}`;
    }
    return `M ${fromX} ${fromBottomY} L ${fromX} ${dropY} L ${routeX} ${dropY} L ${routeX} ${toY} L ${toSideX} ${toY}`;
  }
  function applyCaseOffsetsForFrame(frame, inheritedByLane = null) {
    const inherited = inheritedByLane || Object.fromEntries(lanes.map((lane) => [lane.id, 0]));
    const offsets = frameCaseOffsets.get(frame.id);
    const caseLaneOffset = (caseIdx, laneId) => offsets?.get(`${caseIdx}-${laneId}`) || 0;
    frame.cases.forEach((c, caseIdx) => {
      const anchorLane = resolveCaseLane(c);
      c.offset = anchorLane != null ? caseLaneOffset(caseIdx, anchorLane) : 0;
      c.rowIndices.forEach((stepIdx) => {
        const row = rows[stepIdx];
        if (row?.kind === "step" && !row.empty && row.role) {
          stepOffsetByIndex.set(
            stepIdx,
            (inherited[row.role] || 0) + caseLaneOffset(caseIdx, row.role),
          );
        }
      });
      if (c.childFrame) {
        const childInherited = { ...inherited };
        for (const lane of lanes) {
          childInherited[lane.id] =
            (childInherited[lane.id] || 0) + caseLaneOffset(caseIdx, lane.id);
        }
        applyCaseOffsetsForFrame(c.childFrame, childInherited);
      }
    });
  }
  for (const f of frames) {
    if (!f.parentCase) applyCaseOffsetsForFrame(f, null);
  }
  for (const f of frames) {
    for (const c of f.cases) {
      if (c.childFrame && !caseHasDirectStep(c)) {
        c.x = frameAnchorX(c.childFrame) - (c.offset || 0);
      }
    }
  }
  function nodeCenterX(stepIdx, roleId) {
    const li = laneIndex(roleId);
    if (li < 0) return width / 2;
    const baseX = laneCenter(li);
    const offset = stepOffsetByIndex.get(stepIdx) || 0;
    return baseX + offset;
  }
  function stepObstacleBounds(rowIndex) {
    const row = rows[rowIndex];
    const cx = row?.role && laneIndex(row.role) >= 0 ? nodeCenterX(rowIndex, row.role) : width / 2;
    let left = cx - nodeW / 2;
    let right = cx + nodeW / 2;
    let top = stepBlockCenterY(rowIndex) - stepBoxH / 2;
    let bottom = stepBlockBottomY(rowIndex);
    if (!row || row.kind !== "step") {
      return { left, right, top, bottom };
    }
    const cy = stepBlockCenterY(rowIndex);
    const { left: leftProps, right: rightProps } = splitPropsBySide(row.props);
    const docY = cy + stepBoxH / 2 - stepDocIconOffsetY;
    leftProps.forEach((prop, docIdx) => {
      const x = cx - nodeW / 2 + 55 - docW + docIdx * docGapX;
      left = Math.min(left, x);
      right = Math.max(right, x + docW);
      bottom = Math.max(bottom, docY + docIdx * docGapY + docH);
    });
    rightProps.forEach((prop, docIdx) => {
      const x = cx + nodeW / 2 - 60 + docIdx * docGapX;
      left = Math.min(left, x);
      right = Math.max(right, x + docW);
      bottom = Math.max(bottom, docY + docIdx * docGapY + docH);
    });
    return { left, right, top, bottom };
  }
  function collectLoopObstacles(frame, sourceStepIdx, routeBottomY) {
    const yMin = frame.yDecision;
    const yMax = routeBottomY;
    const overlaps = (top, bottom) => bottom >= yMin && top <= yMax;
    const rects = [];
    rows.forEach((row, idx) => {
      if (row?.kind !== "step" || row.empty || !row.role) return;
      const b = stepObstacleBounds(idx);
      if (overlaps(b.top, b.bottom)) rects.push(b);
    });
    return rects;
  }
  function buildLoopBackPath({
    fromX,
    fromBottomY,
    dCx,
    dCy,
    dW,
    frame,
    sourceStepIdx,
    caseOffset,
  }) {
    const startY = fromBottomY;
    const sourceBounds = sourceStepIdx != null ? stepObstacleBounds(sourceStepIdx) : null;
    const dropY = (sourceBounds?.bottom ?? startY) + loopDropPad;
    const obstacles = collectLoopObstacles(frame, sourceStepIdx, dropY);
    let sideSign;
    if (caseOffset !== 0) {
      sideSign = Math.sign(caseOffset);
    } else if (obstacles.length > 0) {
      const minLeft = Math.min(...obstacles.map((o) => o.left));
      const maxRight = Math.max(...obstacles.map((o) => o.right));
      const spaceLeft = fromX - minLeft;
      const spaceRight = maxRight - fromX;
      sideSign = spaceRight >= spaceLeft ? 1 : -1;
    } else {
      sideSign = fromX <= dCx ? -1 : 1;
    }
    const extentLeft = obstacles.length
      ? Math.min(...obstacles.map((o) => o.left))
      : (sourceBounds?.left ?? fromX - nodeW / 2);
    const extentRight = obstacles.length
      ? Math.max(...obstacles.map((o) => o.right))
      : (sourceBounds?.right ?? fromX + nodeW / 2);
    let routeX;
    if (sideSign < 0) {
      routeX = Math.min(extentLeft, fromX, dCx - dW / 2) - loopRouteMargin;
    } else {
      routeX = Math.max(extentRight, fromX, dCx + dW / 2) + loopRouteMargin;
    }
    const lastLaneIdx = lanes.length - 1;
    const laneGridLeft = laneX(0);
    const laneGridRight =
      lastLaneIdx >= 0 ? laneX(lastLaneIdx) + laneWidth(lastLaneIdx) : width - xPad;
    routeX = Math.max(laneGridLeft, Math.min(laneGridRight, routeX));
    const enterFromLeft = routeX < dCx;
    const toX = enterFromLeft ? dCx - dW / 2 : dCx + dW / 2;
    const toY = dCy;
    if (Math.abs(fromX - routeX) < branchConnectorElbowThreshold) {
      return `M ${fromX} ${startY} L ${fromX} ${dropY} L ${routeX} ${toY} L ${toX} ${toY}`;
    }
    return `M ${fromX} ${startY} L ${fromX} ${dropY} L ${routeX} ${dropY} L ${routeX} ${toY} L ${toX} ${toY}`;
  }
  function splitPropsBySide(propIds) {
    const left = [];
    const right = [];
    (propIds || []).forEach((propId) => {
      const prop = props[propId] || { id: propId, label: propId, side: "right" };
      if (prop.side === "left") left.push(prop);
      else right.push(prop);
    });
    return { left, right };
  }
  function renderPropDocChip(prop, x, y2) {
    const fill = prop.bg || theme.bg;
    const strokeCol = prop.borderColor || theme.stroke;
    const labelColor = prop.textColor || theme.title;
    const maxLen =
      typeof prop.maxChars === "number" && prop.maxChars > 0 ? prop.maxChars : propDefaultMaxChars;
    const tip = prop.title || prop.label || prop.id;
    return /* @__PURE__ */ h(
      Fragment,
      null,
      /* @__PURE__ */ h("title", null, tip),
      /* @__PURE__ */ h("path", {
        d: `M ${x} ${y2} H ${x + docW - propDocFold} L ${x + docW} ${y2 + propDocFold} V ${y2 + docH} H ${x} Z`,
        fill,
        stroke: strokeCol,
        strokeWidth: "1.1",
      }),
      /* @__PURE__ */ h("path", {
        d: `M ${x + docW - propDocFold} ${y2} V ${y2 + propDocFold} H ${x + docW}`,
        fill: "none",
        stroke: strokeCol,
        strokeWidth: "1",
      }),
      /* @__PURE__ */ h(
        "text",
        {
          x: x + docW / 2 - 2,
          y: y2 + propDocTextY,
          textAnchor: "middle",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: String(propDocFontSize),
          fill: labelColor,
        },
        truncate(prop.label || prop.id, maxLen),
      ),
    );
  }
  function pushSequentialStepConnector(prev, cur, key) {
    const prevCase = caseOfStep(prev.i);
    const curCase = caseOfStep(cur.i);
    if (
      prevCase &&
      curCase &&
      (prevCase.frame !== curCase.frame || prevCase.caseIdx !== curCase.caseIdx)
    ) {
      return;
    }
    if (prevCase && !curCase) return;
    if (!prevCase && curCase) return;
    let hasBranchBetween = false;
    for (let j = prev.i + 1; j < cur.i; j++) {
      if (rows[j]?.kind === "branchStart") {
        hasBranchBetween = true;
        break;
      }
    }
    if (hasBranchBetween) return;
    if (rows[prev.i + 1]?.kind === "branchStart") return;
    const fromIdx = laneIndex(prev.r.role);
    const toIdx = laneIndex(cur.r.role);
    if (fromIdx < 0 || toIdx < 0) return;
    const y1 = stepBlockCenterY(prev.i) + 22;
    const y2 = stepBlockCenterY(cur.i) - 22;
    let hasBranchGroupBetween = false;
    for (let j = prev.i + 1; j < cur.i; j++) {
      if (rows[j]?.kind === "groupStart" && groupModeOf(rows[j]) === "branch") {
        hasBranchGroupBetween = true;
        break;
      }
    }
    const bendY = hasBranchGroupBetween
      ? Math.max(y1 + connectorBendMinGap, y2 - connectorBendMaxInset)
      : void 0;
    connectors.push({
      fromX: nodeCenterX(prev.i, prev.r.role),
      toX: nodeCenterX(cur.i, cur.r.role),
      y1,
      y2,
      key,
      lineType: stepOutgoingArrowLine(prev.r),
      bendY,
      caseColor: curCase ? (curCase.frame.cases[curCase.caseIdx]?.color ?? null) : null,
    });
  }
  const mainFlowSteps = stepRows.filter((x) => !isInsideBranchGroup(rows, x.i));
  for (let i = 1; i < mainFlowSteps.length; i++) {
    pushSequentialStepConnector(mainFlowSteps[i - 1], mainFlowSteps[i], `c-main-${i}`);
  }
  for (let i = 1; i < stepRows.length; i++) {
    const prev = stepRows[i - 1];
    const cur = stepRows[i];
    if (!isInsideBranchGroup(rows, prev.i) || !isInsideBranchGroup(rows, cur.i)) continue;
    if (
      findEnclosingBranchGroupStart(rows, prev.i) !== findEnclosingBranchGroupStart(rows, cur.i)
    ) {
      continue;
    }
    pushSequentialStepConnector(prev, cur, `c-grp-${i}`);
  }
  rows.forEach((row, startIdx) => {
    if (row.kind !== "groupStart" || groupModeOf(row) !== "branch") return;
    const endIdx = findGroupEndIndex(rows, startIdx);
    if (endIdx < 0) return;
    const target = findFlowContinuityAfterGroupEnd(rows, endIdx);
    if (!target) return;
    let toX;
    let toY;
    if (target.type === "step") {
      const toRow = rows[target.index];
      if (laneIndex(toRow.role) < 0) return;
      toX = nodeCenterX(target.index, toRow.role);
      toY = stepBlockCenterY(target.index) - 22;
    } else {
      const branchRow = rows[target.index];
      const frame = frames.find((f) => f.id === branchRow.id);
      if (!frame) return;
      toX = frameAnchorX(frame);
      toY = branchDecisionCy(frame) - (frame.parallel ? FORK_GATEWAY_RADIUS : 25);
    }
    const innerLastIdx = lastStepInsideGroup(startIdx, endIdx);
    if (innerLastIdx < 0) return;
    const innerRow = rows[innerLastIdx];
    if (laneIndex(innerRow.role) < 0) return;
    const innerY1 = stepBlockCenterY(innerLastIdx) + 22;
    connectors.push({
      fromX: nodeCenterX(innerLastIdx, innerRow.role),
      toX,
      y1: innerY1,
      y2: toY,
      // Bend just before the continuation so this merge arrow shares its
      // horizontal Y with the arrow coming from the block before the branch.
      bendY: Math.max(innerY1 + connectorGroupBendMinGap, toY - connectorGroupBendMaxInset),
      key: `c-grp-merge-${startIdx}`,
      lineType: stepOutgoingArrowLine(innerRow),
    });
  });
  function lastStepInBranchSpan(startIdx, endIdx) {
    for (let j = endIdx - 1; j > startIdx; j--) {
      const row = rows[j];
      if (row?.kind === "step" && !row.empty && row.role && !isInsideBranchGroup(rows, j)) {
        return j;
      }
    }
    return -1;
  }
  function lastStepInsideGroup(startIdx, endIdx) {
    for (let j = endIdx - 1; j > startIdx; j--) {
      const row = rows[j];
      if (row?.kind !== "step" || row.empty || !row.role) continue;
      if (findEnclosingBranchGroupStart(rows, j) !== startIdx) continue;
      return j;
    }
    return -1;
  }
  const frameById = new Map(frames.map((f) => [f.id, f]));
  function startTerminalAnchor() {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.kind === "step" && !row.empty && row.role) {
        if (isInsideBranchGroup(rows, i)) continue;
        if (laneIndex(row.role) < 0) return null;
        return { x: nodeCenterX(i, row.role), targetY: stepBlockCenterY(i) - 22 };
      }
      if (row.kind === "branchStart") {
        const frame = frameById.get(row.id);
        if (!frame) continue;
        return {
          x: frameAnchorX(frame),
          targetY: branchDecisionCy(frame) - (frame.parallel ? FORK_GATEWAY_RADIUS : 25),
        };
      }
    }
    return null;
  }
  function endTerminalAnchor() {
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (row.kind === "step" && !row.empty && row.role) {
        if (isInsideBranchGroup(rows, i)) continue;
        return {
          x: nodeCenterX(i, row.role),
          sourceY: stepBlockCenterY(i) + 22,
          lineType: stepOutgoingArrowLine(row),
        };
      }
      if (row.kind === "branchEnd") {
        const frame = frameById.get(row.id);
        if (!frame) continue;
        const startIdx = rows.findIndex((r) => r.kind === "branchStart" && r.id === row.id);
        const lastInBranch = startIdx >= 0 ? lastStepInBranchSpan(startIdx, i) : -1;
        const mergeCenterX = mergeAnchorX(frame);
        const mergeBottomY = frame.yMerge + mergeH / 2 + 14;
        return {
          x: mergeCenterX,
          sourceY: mergeBottomY,
          lineType: lastInBranch >= 0 ? stepOutgoingArrowLine(rows[lastInBranch]) : "solid",
        };
      }
    }
    return null;
  }
  const firstAnchor = startTerminalAnchor();
  const lastAnchor = endTerminalAnchor();
  const hasEndTerminal = Boolean(lastAnchor);
  const startTerminal = firstAnchor
    ? {
        x: firstAnchor.x,
        y: Math.max(firstAnchor.targetY - terminalGap, topPad + headerH + startTerminalInset),
        targetY: firstAnchor.targetY,
      }
    : null;
  const endTerminal =
    hasEndTerminal && lastAnchor
      ? {
          x: lastAnchor.x,
          y: lastAnchor.sourceY + terminalGap,
          sourceY: lastAnchor.sourceY,
        }
      : null;
  const endTerminalBottom = endTerminal ? endTerminal.y + terminalRadius + endTerminalBottomPad : 0;
  const height = Math.max(y + baseBottomPadding, endTerminalBottom);
  let lastStepRowIndex = -1;
  for (let idx = rows.length - 1; idx >= 0; idx--) {
    const row = rows[idx];
    if (row.kind === "step" && !row.empty && row.role) {
      lastStepRowIndex = idx;
      break;
    }
  }
  const dividerLandsOnGroupEnd = (i) => {
    let k = i + 1;
    while (rows[k]?.kind === "branchCase") k++;
    return rows[k]?.kind === "groupEnd" && groupModeOf(rows[k]) === "branch";
  };
  const dividerYBelowNext = (i, fallbackY) => {
    const next = rows[i + 1];
    const nextMeta = rowMeta[i + 1];
    if (nextMeta == null) return fallbackY;
    if (next.kind === "branchStart") return nextMeta.y + diamondH;
    if (next.kind === "branchLoop") return nextMeta.y + branchLoopH;
    return fallbackY;
  };
  const stepRowDividerYs = [];
  if (lanes.length > 0 && lastStepRowIndex >= 0) {
    rows.forEach((row, i) => {
      const next = rows[i + 1];
      const meta = rowMeta[i];
      if (row.kind === "branchEnd") {
        if (meta == null) return;
        if (next?.kind === "step" && next.skipIndex) return;
        if (dividerLandsOnGroupEnd(i)) return;
        stepRowDividerYs.push(meta.y + mergeH);
        return;
      }
      if (row.kind === "step" && row.empty) {
        if (meta == null) return;
        if (next?.kind === "step" && next.skipIndex) return;
        if (dividerLandsOnGroupEnd(i)) return;
        const base2 = meta.y + (stepRowHeightByIndex.get(i) ?? rowH);
        stepRowDividerYs.push(dividerYBelowNext(i, base2));
        return;
      }
      if (row.kind !== "step" || !row.role) return;
      if (row.skipIndex) return;
      if (i === lastStepRowIndex && next?.kind !== "branchLoop") return;
      if (meta == null) return;
      if (next?.kind === "step" && next.skipIndex) return;
      if (dividerLandsOnGroupEnd(i)) return;
      const base = meta.y + (stepRowHeightByIndex.get(i) ?? stepRowHeight(row, i));
      stepRowDividerYs.push(dividerYBelowNext(i, base));
    });
  }
  const swimlaneDividerX1 = xPad;
  const swimlaneDividerX2 =
    (lanes.length > 0 ? laneX(lanes.length - 1) + laneWidth(lanes.length - 1) + outerPad : 0) +
    rightGutter;
  // Coerce the branded markup back to a plain string at the public boundary so
  // consumers (React state, `Boolean(svg)`, file export) see a normal string.
  return String(
    /* @__PURE__ */ h(
      "svg",
      {
        viewBox: `0 0 ${width} ${height}`,
        xmlns: "http://www.w3.org/2000/svg",
        style: {
          width: "100%",
          height: "auto",
          background: theme.bg,
          display: "block",
        },
        id: "swimlane-svg",
      },
      /* @__PURE__ */ h(
        "defs",
        null,
        /* @__PURE__ */ h(
          "marker",
          {
            id: "arrowhead",
            viewBox: "0 0 10 10",
            refX: "9",
            refY: "5",
            markerWidth: "7",
            markerHeight: "7",
            orient: "auto-start-reverse",
          },
          /* @__PURE__ */ h("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: theme.stroke }),
        ),
        branchColorArrows &&
          Object.entries(BRANCH_COLOR_STYLES).map(([key, style]) =>
            /* @__PURE__ */ h(
              "marker",
              {
                key,
                id: `arrowhead-${key}`,
                viewBox: "0 0 10 10",
                refX: "9",
                refY: "5",
                markerWidth: "7",
                markerHeight: "7",
                orient: "auto-start-reverse",
              },
              /* @__PURE__ */ h("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: style.stroke }),
            ),
          ),
        /* @__PURE__ */ h(
          "pattern",
          {
            id: "gridp",
            width: "24",
            height: "24",
            patternUnits: "userSpaceOnUse",
          },
          /* @__PURE__ */ h("path", {
            d: "M 24 0 L 0 0 0 24",
            fill: "none",
            stroke: theme.grid,
            strokeWidth: "0.5",
          }),
        ),
      ),
      /* @__PURE__ */ h("rect", {
        x: xPad,
        y: topPad,
        width: width - xPad * 2,
        height: height - topPad - gridBottomPad,
        fill: "url(#gridp)",
        opacity: "0.5",
      }),
      showLeftGutter &&
        /* @__PURE__ */ h(
          Fragment,
          null,
          /* @__PURE__ */ h("rect", {
            x: xPad,
            y: topPad,
            width: leftGutter,
            height: headerH,
            fill: "white",
            opacity: "0.9",
          }),
          page.leftTitle?.trim() &&
            /* @__PURE__ */ h(
              "text",
              {
                x: xPad + gutterInnerPad,
                y: topPad + 30,
                fill: theme.title,
                fontFamily: "'Noto Sans JP',sans-serif",
                fontSize: String(L.gutterHeaderTitleFontSize),
                fontWeight: "700",
              },
              truncateToColumns(
                page.leftTitle.trim(),
                gutterTextCols(leftGutterWidth, L.gutterHeaderTitleFontSize),
              ),
            ),
          page.leftSubtitle?.trim() &&
            /* @__PURE__ */ h(
              "text",
              {
                x: xPad + gutterInnerPad,
                y: topPad + 50,
                fill: theme.laneText || theme.title,
                opacity: "0.7",
                fontFamily: "'Noto Sans JP',sans-serif",
                fontSize: String(L.gutterHeaderSubtitleFontSize),
              },
              truncateToColumns(
                page.leftSubtitle.trim(),
                gutterTextCols(leftGutterWidth, L.gutterHeaderSubtitleFontSize),
              ),
            ),
          /* @__PURE__ */ h("line", {
            x1: xPad,
            x2: xPad + leftGutter,
            y1: topPad + headerH,
            y2: topPad + headerH,
            stroke: theme.stroke,
            strokeWidth: "1.2",
            vectorEffect: "non-scaling-stroke",
          }),
          /* @__PURE__ */ h("rect", {
            x: xPad,
            y: topPad,
            width: leftGutter,
            height: height - topPad - gridBottomPad,
            fill: "none",
            stroke: theme.stroke,
            strokeWidth: "1.2",
            vectorEffect: "non-scaling-stroke",
          }),
          rows.map((r, i) => {
            if (r.kind !== "step" || r.empty || !r.role) return null;
            if (r.skipIndex) return null;
            const yRow = rowMeta[i]?.y;
            if (yRow == null) return null;
            const d = stepRowDisplay.get(i);
            const titleText = (r.name || r.text || "").trim();
            const hasNum = d && !d.skipped && d.displayIndex != null;
            const prefix = hasNum ? `${d.displayIndex}. ` : "";
            if (!titleText && !r.description) return null;
            const titleCols =
              gutterTextCols(leftGutterWidth, L.gutterStepTitleFontSize) -
              stringDisplayColumnWidth(prefix);
            return /* @__PURE__ */ h(
              "g",
              { key: `step-left-${i}` },
              titleText &&
                /* @__PURE__ */ h(
                  "text",
                  {
                    x: gutterInnerPad + xPad,
                    y: yRow + gutterTextBaselineY,
                    fill: theme.title,
                    fontFamily: "'Noto Sans JP',sans-serif",
                    fontSize: String(L.gutterStepTitleFontSize),
                    fontWeight: "600",
                  },
                  prefix,
                  truncateToColumns(titleText, titleCols),
                ),
              r.description?.trim() &&
                /* @__PURE__ */ h(GutterBodyText, {
                  x: gutterInnerPad + xPad,
                  y: yRow + gutterTextBaselineY + (titleText ? gutterTitleLineH : 0),
                  text: r.description.trim(),
                  wrapCols: descWrapCols,
                  fill: theme.laneText || theme.title,
                  opacity: "0.78",
                }),
            );
          }),
        ),
      rightGutterVisible &&
        /* @__PURE__ */ h(
          Fragment,
          null,
          /* @__PURE__ */ h("rect", {
            x: rightGutterX,
            y: topPad,
            width: rightGutter,
            height: headerH,
            fill: "white",
            opacity: "0.9",
          }),
          page.rightTitle?.trim() &&
            /* @__PURE__ */ h(
              "text",
              {
                x: rightGutterX + gutterInnerPad,
                y: topPad + 30,
                fill: theme.title,
                fontFamily: "'Noto Sans JP',sans-serif",
                fontSize: String(L.gutterHeaderTitleFontSize),
                fontWeight: "700",
              },
              truncateToColumns(
                page.rightTitle.trim(),
                gutterTextCols(rightGutterWidth, L.gutterHeaderTitleFontSize),
              ),
            ),
          page.rightSubtitle?.trim() &&
            /* @__PURE__ */ h(
              "text",
              {
                x: rightGutterX + gutterInnerPad,
                y: topPad + 50,
                fill: theme.laneText || theme.title,
                opacity: "0.7",
                fontFamily: "'Noto Sans JP',sans-serif",
                fontSize: String(L.gutterHeaderSubtitleFontSize),
              },
              truncateToColumns(
                page.rightSubtitle.trim(),
                gutterTextCols(rightGutterWidth, L.gutterHeaderSubtitleFontSize),
              ),
            ),
          /* @__PURE__ */ h("line", {
            x1: rightGutterX,
            x2: rightGutterX + rightGutter,
            y1: topPad + headerH,
            y2: topPad + headerH,
            stroke: theme.stroke,
            strokeWidth: "1.2",
            vectorEffect: "non-scaling-stroke",
          }),
          /* @__PURE__ */ h("rect", {
            x: rightGutterX,
            y: topPad,
            width: rightGutter,
            height: height - topPad - gridBottomPad,
            fill: "none",
            stroke: theme.stroke,
            strokeWidth: "1.2",
            vectorEffect: "non-scaling-stroke",
          }),
          rows.map((r, i) => {
            if (r.kind !== "step" || r.empty || !r.role) return null;
            const yRow = rowMeta[i]?.y;
            if (yRow == null) return null;
            const remark = (r.remark || "").trim();
            if (!remark) return null;
            return /* @__PURE__ */ h(GutterBodyText, {
              key: `step-remark-${i}`,
              x: rightGutterX + gutterInnerPad,
              y: yRow + gutterTextBaselineY,
              text: remark,
              wrapCols: remarkWrapCols,
              fill: theme.laneText || theme.title,
              opacity: "0.85",
            });
          }),
        ),
      lanes.map((lane, i) => {
        // The outermost lanes also paint the outer padding band (reserved for
        // section borders / side rails) so no unfilled gap is left between the
        // lane grid and the gutters. Content geometry (laneX/laneWidth) is
        // unchanged — this only widens what the first/last lane paint.
        const x = laneX(i) - (i === 0 ? outerPad : 0);
        const currentLaneW =
          laneWidth(i) + (i === 0 ? outerPad : 0) + (i === lanes.length - 1 ? outerPad : 0);
        const bg = lane.bg || theme.laneFills[i % theme.laneFills.length];
        const txt = lane.textColor || theme.laneText;
        return /* @__PURE__ */ h(
          "g",
          { key: `lane-${i}` },
          /* @__PURE__ */ h("rect", {
            x,
            y: topPad,
            width: currentLaneW,
            height: height - topPad - gridBottomPad,
            fill: bg,
            opacity: "0.12",
          }),
          /* @__PURE__ */ h("rect", {
            x,
            y: topPad,
            width: currentLaneW,
            height: headerH,
            fill: bg,
            opacity: "0.9",
          }),
          (lane.icon || lane.iconAsset) &&
            /* @__PURE__ */ h(
              "g",
              null,
              /* @__PURE__ */ h("circle", {
                cx: x + 28,
                cy: topPad + headerH / 2,
                r: "16",
                fill: theme.bg,
                stroke: txt,
                strokeWidth: "1.2",
              }),
              /* @__PURE__ */ h(BlockIcon, {
                icon: lane.icon,
                iconAsset: lane.iconAsset,
                x: x + gutterInnerPad,
                y: topPad + headerH / 2,
                size: 22,
                color: txt,
                shape: "rounded",
              }),
            ),
          /* @__PURE__ */ h(
            "text",
            {
              x: lane.icon ? x + 54 : x + currentLaneW / 2,
              y: topPad + headerH / 2 + 6,
              textAnchor: lane.icon ? "start" : "middle",
              fill: txt,
              fontFamily: "'Noto Sans JP',sans-serif",
              fontSize: "15",
              fontWeight: "700",
              letterSpacing: "0.06em",
            },
            lane.label,
          ),
          /* @__PURE__ */ h("line", {
            x1: x,
            x2: x + currentLaneW,
            y1: topPad + headerH,
            y2: topPad + headerH,
            stroke: theme.stroke,
            strokeWidth: "1.2",
            vectorEffect: "non-scaling-stroke",
          }),
        );
      }),
      stepRowDividerYs.map((yLine, di) =>
        /* @__PURE__ */ h("line", {
          key: `step-row-div-${di}`,
          x1: swimlaneDividerX1,
          y1: yLine,
          x2: swimlaneDividerX2,
          y2: yLine,
          stroke: theme.grid,
          strokeWidth: "1",
          vectorEffect: "non-scaling-stroke",
          opacity: "0.95",
        }),
      ),
      lanes.length > 0 &&
        /* @__PURE__ */ h(
          Fragment,
          null,
          /* @__PURE__ */ h("rect", {
            x: laneX(0) - outerPad,
            y: topPad,
            width: laneWidths.reduce((sum, w) => sum + w, 0) + outerPad * 2,
            height: height - topPad - gridBottomPad,
            fill: "none",
            stroke: theme.stroke,
            strokeWidth: "1.2",
            vectorEffect: "non-scaling-stroke",
          }),
          lanes.slice(1).map((lane, i) =>
            /* @__PURE__ */ h("line", {
              key: `lane-divider-${lane.id ?? i + 1}`,
              x1: laneX(i + 1),
              x2: laneX(i + 1),
              y1: topPad,
              y2: height - gridBottomPad,
              stroke: theme.stroke,
              strokeWidth: "1.2",
              vectorEffect: "non-scaling-stroke",
            }),
          ),
        ),
      frames.map((f) => {
        if (f.yMerge == null) return null;
        const isParallel = f.parallel;
        const dCx = frameAnchorX(f);
        const dCy = branchDecisionCy(f);
        const dW = isParallel ? 0 : decisionDiamondWidth(f.cond.length);
        const dH = decisionDiamondH;
        const decisionStyle = resolveBranchStyle(f.decisionColor);
        const parallelGatewayStyle = resolveBranchStyle(f.decisionColor || "purple");
        const mCx = mergeAnchorX(f);
        const mCy = f.yMerge + mergeH / 2;
        const mW = mergeNodeW;
        const mH = mergeNodeH;
        const diamondPath = (cx, cy, w, h2) =>
          `M ${cx} ${cy - h2 / 2} L ${cx + w / 2} ${cy} L ${cx} ${cy + h2 / 2} L ${cx - w / 2} ${cy} Z`;
        return /* @__PURE__ */ h(
          "g",
          { key: `branch-${f.id}` },
          isParallel
            ? /* @__PURE__ */ h("circle", {
                cx: dCx,
                cy: dCy,
                r: FORK_GATEWAY_RADIUS,
                fill: parallelGatewayStyle.bg,
                stroke: parallelGatewayStyle.stroke,
                strokeWidth: "1.6",
              })
            : /* @__PURE__ */ h(
                Fragment,
                null,
                /* @__PURE__ */ h("path", {
                  d: diamondPath(dCx, dCy, dW, dH),
                  fill: theme.branchBg,
                  stroke: theme.branch,
                  strokeWidth: "1.8",
                }),
                /* @__PURE__ */ h(
                  "text",
                  {
                    x: dCx,
                    y: dCy + decisionTextOffsetY,
                    textAnchor: "middle",
                    fontFamily: DIAGRAM_LAYOUT.decisionFontFamily,
                    fontSize: String(DIAGRAM_LAYOUT.decisionFontSize),
                    fontWeight: "600",
                    fill: theme.branch,
                  },
                  truncateToColumns(f.cond, blockMaxTextCols("if", false)),
                ),
              ),
          f.cases.map((c, ci) => {
            const edgeD = buildCaseFanOutEdgeD(f, c);
            const firstStepIdx = firstMainFlowStepIdx(c) ?? firstStepIdxInCase(c);
            const showArrow =
              firstStepIdx != null && caseStepLineTarget(firstStepIdx, c)?.showArrow;
            const cStroke =
              branchColorArrows && c.color ? resolveBranchStyle(c.color).stroke : theme.stroke;
            const cMarker =
              branchColorArrows && c.color ? `url(#arrowhead-${c.color})` : "url(#arrowhead)";
            return /* @__PURE__ */ h(
              "g",
              { key: `case-${f.id}-${ci}` },
              /* @__PURE__ */ h("path", {
                d: edgeD,
                fill: "none",
                stroke: cStroke,
                strokeWidth: "1.6",
                markerEnd: showArrow ? cMarker : void 0,
              }),
            );
          }),
          f.cases.map((c, ci) => {
            const stubCase = isStubCase(c, f.id);
            const startY = dCy + dH / 2;
            const caseRailY = startY + branchCaseBendYOffset;
            const cStroke =
              branchColorArrows && c.color ? resolveBranchStyle(c.color).stroke : theme.stroke;
            const cMarker =
              branchColorArrows && c.color ? `url(#arrowhead-${c.color})` : "url(#arrowhead)";
            const mergeJump = mergeAnchorInCase(c.rowIndices, f.id);
            if (mergeJump) {
              let fromX2;
              let fromBottomY;
              if (mergeJump.prevStepIdx != null) {
                const r = rows[mergeJump.prevStepIdx];
                const li = laneIndex(r.role);
                fromX2 = li >= 0 ? nodeCenterX(mergeJump.prevStepIdx, r.role) : c.x;
                fromBottomY = stepBlockBottomY(mergeJump.prevStepIdx);
              } else {
                fromX2 = caseAnchorX(c);
                const mIdxY = rowMeta[mergeJump.mergeIdx]?.y ?? f.yDecision;
                fromBottomY = mIdxY + branchMergeH;
              }
              const d2 = buildMergeForwardPath({
                fromX: fromX2,
                fromBottomY,
                targetIdx: mergeJump.targetIdx,
              });
              const mergeLineType =
                mergeJump.prevStepIdx != null
                  ? stepOutgoingArrowLine(rows[mergeJump.prevStepIdx])
                  : "solid";
              return /* @__PURE__ */ h("path", {
                key: `merge-${f.id}-${ci}`,
                d: d2,
                fill: "none",
                stroke: cStroke,
                strokeWidth: "1.6",
                markerEnd: cMarker,
                ...arrowLineStrokeProps(mergeLineType),
              });
            }
            const anchor = loopAnchorInCase(c.rowIndices, f.id);
            if (anchor) {
              let fromX2;
              let fromBottomY;
              let sourceStepIdx = null;
              if (anchor.prevStepIdx != null) {
                sourceStepIdx = anchor.prevStepIdx;
                const r = rows[anchor.prevStepIdx];
                const li = laneIndex(r.role);
                fromX2 = li >= 0 ? nodeCenterX(anchor.prevStepIdx, r.role) : c.x;
                fromBottomY = stepBlockBottomY(anchor.prevStepIdx);
              } else {
                fromX2 = c.x;
                const loopY = rowMeta[anchor.loopIdx]?.y ?? f.yDecision;
                fromBottomY = loopY + (stepRowHeightByIndex.get(anchor.loopIdx) || branchLoopH);
              }
              const d2 = buildLoopBackPath({
                fromX: fromX2,
                fromBottomY,
                dCx,
                dCy,
                dW,
                frame: f,
                sourceStepIdx,
                caseOffset: c.offset || 0,
              });
              const loopLineType =
                sourceStepIdx != null ? stepOutgoingArrowLine(rows[sourceStepIdx]) : "solid";
              return /* @__PURE__ */ h("path", {
                key: `loop-${f.id}-${ci}`,
                d: d2,
                fill: "none",
                stroke: cStroke,
                strokeWidth: "1.6",
                markerEnd: cMarker,
                ...arrowLineStrokeProps(loopLineType),
              });
            }
            const mergeFrom = caseMergeAnchor(c);
            let fromX;
            let fromY;
            if (stubCase) {
              fromX = caseAnchorX(c);
              fromY = caseRailY;
            } else if (mergeFrom) {
              fromX = mergeFrom.fromX;
              fromY = mergeFrom.fromY;
            } else {
              const lastStepIdx = lastStepIdxInCase(c);
              const stepSource = lastStepIdx != null ? caseStepLineSource(lastStepIdx, c) : null;
              if (stepSource) {
                fromX = stepSource.x;
                fromY = stepSource.y;
              } else {
                fromX = caseAnchorX(c);
                fromY = caseRailY;
              }
            }
            const toX = mCx;
            const toY = mCy - (isParallel ? FORK_GATEWAY_RADIUS : mH / 2);
            const bendY2 = toY - 14;
            const sideOffset = c.offset || 0;
            const needsMergeElbow = Math.abs(fromX - toX) > 0.5 || sideOffset !== 0 || stubCase;
            const d = needsMergeElbow
              ? `M ${fromX} ${fromY} L ${fromX} ${bendY2} L ${toX} ${bendY2} L ${toX} ${toY}`
              : `M ${fromX} ${fromY} L ${toX} ${toY}`;
            const lastInCase = lastMainFlowStepIdx(c) ?? lastStepIdxInCase(c);
            const mrgLineType =
              lastInCase != null ? stepOutgoingArrowLine(rows[lastInCase]) : "solid";
            return /* @__PURE__ */ h("path", {
              key: `mrg-${f.id}-${ci}`,
              d,
              fill: "none",
              stroke: cStroke,
              strokeWidth: "1.6",
              ...arrowLineStrokeProps(mrgLineType),
            });
          }),
          f.cases.map((c, ci) => {
            const child = c.childFrame;
            const afterIdx = firstDirectStepAfterChild(c);
            if (child?.yMerge == null || afterIdx == null) return null;
            const stepTarget = caseStepLineTarget(afterIdx, c);
            if (!stepTarget) return null;
            const fromX = mergeAnchorX(child);
            const fromY = child.yMerge + mergeH / 2 + 14;
            const toX = stepTarget.x;
            const toY = stepTarget.y;
            const mid = (fromY + toY) / 2;
            const d =
              Math.abs(fromX - toX) < 0.5
                ? `M ${fromX} ${fromY} L ${toX} ${toY}`
                : `M ${fromX} ${fromY} L ${fromX} ${mid} L ${toX} ${mid} L ${toX} ${toY}`;
            const cStroke2 =
              branchColorArrows && c.color ? resolveBranchStyle(c.color).stroke : theme.stroke;
            const cMarker2 =
              branchColorArrows && c.color ? `url(#arrowhead-${c.color})` : "url(#arrowhead)";
            return /* @__PURE__ */ h("path", {
              key: `nested-out-${f.id}-${ci}`,
              d,
              fill: "none",
              stroke: cStroke2,
              strokeWidth: "1.6",
              markerEnd: cMarker2,
            });
          }),
          isParallel
            ? /* @__PURE__ */ h("circle", {
                cx: mCx,
                cy: mCy,
                r: FORK_GATEWAY_RADIUS,
                fill: parallelGatewayStyle.bg,
                stroke: parallelGatewayStyle.stroke,
                strokeWidth: "1.6",
              })
            : /* @__PURE__ */ h("path", {
                d: diamondPath(mCx, mCy, mW, mH),
                fill: theme.branchBg,
                stroke: theme.branch,
                strokeWidth: "1.6",
              }),
        );
      }),
      rows.map((row, i) => {
        if (row.kind !== "groupStart" || groupModeOf(row) !== "section") {
          return null;
        }
        const endIdx = findGroupEndIndex(rows, i);
        if (endIdx < 0 || lanes.length === 0) return null;
        const yTop = rowMeta[i]?.y ?? 0;
        const yEnd = rowMeta[endIdx]?.y ?? yTop;
        let sectionNestDepth = 0;
        for (let k = 0; k < i; k++) {
          if (rows[k].kind === "groupStart" && groupModeOf(rows[k]) === "section") {
            const ek = findGroupEndIndex(rows, k);
            if (ek > i) sectionNestDepth++;
          }
        }
        const nestInset = sectionNestDepth * sectionNestStep;
        // Inset from the *painted* grid edge (the outermost lanes also paint the
        // outerPad band), so the box spans the visible lanes with the designed
        // sectionEdgeInset margin and still clears the side rails by outerPad.
        const boxX = laneX(0) - outerPad + sectionEdgeInset + nestInset;
        const boxW =
          laneWidths.reduce((sum, w) => sum + w, 0) +
          outerPad * 2 -
          sectionEdgeInset * 2 -
          nestInset * 2;
        const style =
          row.sectionColor && BRANCH_COLOR_STYLES[row.sectionColor]
            ? BRANCH_COLOR_STYLES[row.sectionColor]
            : { stroke: theme.stroke, bg: theme.branchBg };
        const label = (row.sectionName || "Section").trim() || "Section";
        return /* @__PURE__ */ h(
          "g",
          { key: `section-${row.id}` },
          /* @__PURE__ */ h("rect", {
            x: boxX,
            y: yTop + sectionInset,
            width: boxW,
            height: Math.max(0, yEnd - yTop - sectionInset * 2),
            rx: "8",
            fill: style.bg,
            fillOpacity: "0.2",
            stroke: style.stroke,
            strokeWidth: "1.1",
            strokeDasharray: "6 4",
          }),
          /* @__PURE__ */ h(
            "text",
            {
              x: boxX + 8,
              y: yTop + 20,
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: "12",
              fill: style.stroke,
              opacity: "0.9",
            },
            label,
          ),
        );
      }),
      connectors.map((c) => {
        const dash = arrowLineStrokeProps(c.lineType || "solid");
        const cStroke =
          branchColorArrows && c.caseColor ? resolveBranchStyle(c.caseColor).stroke : theme.stroke;
        const cMarker =
          branchColorArrows && c.caseColor ? `url(#arrowhead-${c.caseColor})` : "url(#arrowhead)";
        if (Math.abs(c.fromX - c.toX) < 0.5) {
          const x = c.fromX;
          return /* @__PURE__ */ h("line", {
            key: c.key,
            x1: x,
            y1: c.y1,
            x2: x,
            y2: c.y2,
            stroke: cStroke,
            strokeWidth: "1.6",
            markerEnd: cMarker,
            ...dash,
          });
        }
        const x1 = c.fromX;
        const x2 = c.toX;
        const mid = c.bendY ?? (c.y1 + c.y2) / 2;
        const d = `M ${x1} ${c.y1} L ${x1} ${mid} L ${x2} ${mid} L ${x2} ${c.y2}`;
        return /* @__PURE__ */ h("path", {
          key: c.key,
          d,
          fill: "none",
          stroke: cStroke,
          strokeWidth: "1.6",
          markerEnd: cMarker,
          ...dash,
        });
      }),
      startTerminal &&
        /* @__PURE__ */ h(
          Fragment,
          null,
          /* @__PURE__ */ h("line", {
            x1: startTerminal.x,
            y1: startTerminal.y + terminalRadius,
            x2: startTerminal.x,
            y2: startTerminal.targetY,
            stroke: theme.stroke,
            strokeWidth: "1.6",
            markerEnd: "url(#arrowhead)",
          }),
          /* @__PURE__ */ h("circle", {
            cx: startTerminal.x,
            cy: startTerminal.y,
            r: terminalRadius,
            fill: theme.stroke,
          }),
        ),
      endTerminal &&
        /* @__PURE__ */ h(
          Fragment,
          null,
          /* @__PURE__ */ h("line", {
            x1: endTerminal.x,
            y1: endTerminal.sourceY,
            x2: endTerminal.x,
            y2: endTerminal.y - terminalRadius,
            stroke: theme.stroke,
            strokeWidth: "1.6",
            markerEnd: "url(#arrowhead)",
            ...arrowLineStrokeProps(endTerminal.lineType || "solid"),
          }),
          /* @__PURE__ */ h("circle", {
            cx: endTerminal.x,
            cy: endTerminal.y,
            r: terminalRadius,
            fill: theme.stroke,
          }),
        ),
      rows.map((r, i) => {
        const yRow = rowMeta[i]?.y;
        if (yRow == null || r.kind !== "step") return null;
        if (r.empty) {
          const emptyCase = findCaseForStep(i);
          const cx2 = emptyCase ? caseAnchorX(emptyCase) : width / 2;
          return /* @__PURE__ */ h("circle", {
            key: `step-${i}`,
            cx: cx2,
            cy: stepBlockCenterY(i),
            r: "5",
            fill: theme.stroke,
            opacity: "0.35",
          });
        }
        const idx = laneIndex(r.role);
        if (idx < 0) return null;
        const lane = lanes[idx];
        const block = r.blockRef ? blocks[r.blockRef] : null;
        const cx = nodeCenterX(i, r.role);
        const cy = stepBlockCenterY(i);
        const boxW = nodeW;
        const boxH = 44;
        const fill = (block && block.bg) || lane.bg || theme.boxBg;
        const txtColor = (block && block.textColor) || lane.textColor || theme.boxText;
        const stroke = (block && block.borderColor) || theme.stroke;
        const shape = (block && block.shape) || "rounded";
        const blockIcon = block && block.icon;
        const blockIconAsset = block && block.iconAsset;
        const { left: leftProps, right: rightProps } = splitPropsBySide(r.props);
        const docY = cy + boxH / 2 - 8;
        return /* @__PURE__ */ h(
          "g",
          { key: `step-${i}` },
          /* @__PURE__ */ h(StepShape, {
            shape,
            cx,
            cy,
            w: boxW,
            h: boxH,
            fill,
            stroke,
          }),
          (blockIcon || blockIconAsset) &&
            /* @__PURE__ */ h(BlockIcon, {
              icon: blockIcon,
              iconAsset: blockIconAsset,
              x: cx - boxW / 2,
              y: cy,
              size: 16,
              color: txtColor,
              shape,
            }),
          /* @__PURE__ */ h(
            "text",
            {
              x: blockIcon ? cx + 8 : cx,
              y: cy + 5,
              textAnchor: "middle",
              fill: txtColor,
              fontFamily: "'Noto Sans JP',sans-serif",
              fontSize: "13",
              fontWeight: "500",
            },
            truncateToColumns(r.text, blockMaxTextCols(shape, Boolean(blockIcon))),
          ),
          showStepBlockCaptions &&
            r.blockRef &&
            /* @__PURE__ */ h(
              "text",
              {
                "data-export-caption": "block-ref",
                x: cx + boxW / 2 - 4,
                y: cy - boxH / 2 - 5,
                textAnchor: "end",
                fontSize: "8",
                fontFamily: "'JetBrains Mono',monospace",
                opacity: "0.45",
              },
              r.blockRef,
            ),
          showStepBlockCaptions &&
            shape &&
            /* @__PURE__ */ h(
              "text",
              {
                "data-export-caption": "shape",
                x: cx - boxW / 2 + 4,
                y: cy - boxH / 2 - 5,
                textAnchor: "start",
                fontSize: "8",
                fontFamily: "'JetBrains Mono',monospace",
                opacity: "0.45",
              },
              shape.toUpperCase(),
            ),
          [...leftProps].reverse().map((prop, docIdx) => {
            const x = cx - boxW / 2 + 55 - docW + docIdx * docGapX;
            const y2 = docY + docIdx * docGapY;
            return /* @__PURE__ */ h(
              "g",
              { key: `prop-left-${i}-${prop.id}` },
              renderPropDocChip(prop, x, y2),
            );
          }),
          rightProps.map((prop, docIdx) => {
            const x = cx + boxW / 2 - 60 + docIdx * docGapX;
            const y2 = docY + docIdx * docGapY;
            return /* @__PURE__ */ h(
              "g",
              { key: `prop-right-${i}-${prop.id}` },
              renderPropDocChip(prop, x, y2),
            );
          }),
        );
      }),
      frames.map((f) => {
        if (f.yMerge == null) return null;
        return f.cases.map((c, ci) => {
          if (!(c.label || "").trim()) return null;
          if (/^else$/i.test((c.label || "").trim())) return null;
          const { labelX, labelY, labelW } = caseLabelPosition(f, c);
          const caseStyle = resolveBranchStyle(c.color);
          return /* @__PURE__ */ h(
            "g",
            { key: `case-label-overlay-${f.id}-${ci}` },
            /* @__PURE__ */ h("rect", {
              x: labelX - labelW / 2,
              y: labelY - caseLabelPadY,
              width: labelW,
              height: caseLabelHeight,
              rx: "3",
              fill: caseStyle.bg,
              fillOpacity: "0.8",
              stroke: caseStyle.stroke,
              strokeWidth: "0.9",
            }),
            /* @__PURE__ */ h(
              "text",
              {
                x: labelX,
                y: labelY + 4,
                textAnchor: "middle",
                fontSize: "11",
                fontWeight: "600",
                fontFamily: "'Noto Sans JP',sans-serif",
                fill: caseStyle.stroke,
              },
              c.label,
            ),
          );
        });
      }),
      frames.map((f) => {
        const startIdx = rows.findIndex((r) => r.kind === "branchStart" && r.id === f.id);
        if (startIdx < 0) return null;
        let prevStepIdx = -1;
        for (let j = startIdx - 1; j >= 0; j--) {
          const row = rows[j];
          if (row.kind === "step" && !row.empty && row.role && !isInsideBranchGroup(rows, j)) {
            prevStepIdx = j;
            break;
          }
          if (
            row.kind === "branchCase" &&
            (row.id === f.id || (row.depth != null && row.depth < f.depth))
          )
            break;
          if (row.kind === "branchStart" && row.depth < f.depth) break;
          if (row.kind === "branchEnd") break;
        }
        const endIdx = rows.findIndex((r) => r.kind === "branchEnd" && r.id === f.id);
        if (endIdx < 0) return null;
        const nextStepIdx = findNextFlowStepAfterBranchEnd(rows, startIdx, endIdx);
        const nextBranchStartIdx = findNextSiblingBranchStart(rows, startIdx, endIdx);
        const dCx = frameAnchorX(f);
        const dCy = branchDecisionCy(f);
        const dTopY = dCy - (f.parallel ? FORK_GATEWAY_RADIUS : 25);
        const mCx = mergeAnchorX(f);
        const mBotY = f.yMerge + mergeH / 2 + (f.parallel ? FORK_GATEWAY_RADIUS : 14);
        const edges = [];
        const branchLastStep = lastStepInBranchSpan(startIdx, endIdx);
        if (prevStepIdx >= 0) {
          const r = rows[prevStepIdx];
          const li = laneIndex(r.role);
          const sx = li >= 0 ? nodeCenterX(prevStepIdx, r.role) : dCx;
          const sy = stepBlockCenterY(prevStepIdx) + 22;
          let branchGroupBeforeGateway = false;
          for (let j = prevStepIdx + 1; j < startIdx; j++) {
            if (rows[j]?.kind === "groupStart" && groupModeOf(rows[j]) === "branch") {
              branchGroupBeforeGateway = true;
              break;
            }
          }
          const bend = branchGroupBeforeGateway
            ? Math.max(sy + connectorBendMinGap, dTopY - connectorBendMaxInset)
            : (sy + dTopY) / 2;
          const d =
            sx === dCx
              ? `M ${sx} ${sy} L ${dCx} ${dTopY}`
              : `M ${sx} ${sy} L ${sx} ${bend} L ${dCx} ${bend} L ${dCx} ${dTopY}`;
          edges.push(
            /* @__PURE__ */ h("path", {
              key: `in-${f.id}`,
              d,
              fill: "none",
              stroke: theme.stroke,
              strokeWidth: "1.6",
              markerEnd: "url(#arrowhead)",
              ...arrowLineStrokeProps(stepOutgoingArrowLine(r)),
            }),
          );
        }
        if (nextStepIdx >= 0) {
          const r = rows[nextStepIdx];
          const li = laneIndex(r.role);
          const tx = li >= 0 ? nodeCenterX(nextStepIdx, r.role) : mCx;
          const ty = stepBlockCenterY(nextStepIdx) - 22;
          const bend = (mBotY + ty) / 2;
          const d =
            tx === mCx
              ? `M ${mCx} ${mBotY} L ${tx} ${ty}`
              : `M ${mCx} ${mBotY} L ${mCx} ${bend} L ${tx} ${bend} L ${tx} ${ty}`;
          const outLineType =
            branchLastStep >= 0 ? stepOutgoingArrowLine(rows[branchLastStep]) : "solid";
          edges.push(
            /* @__PURE__ */ h("path", {
              key: `out-${f.id}`,
              d,
              fill: "none",
              stroke: theme.stroke,
              strokeWidth: "1.6",
              markerEnd: "url(#arrowhead)",
              ...arrowLineStrokeProps(outLineType),
            }),
          );
        } else if (nextBranchStartIdx >= 0) {
          const nextFrame = frameById.get(rows[nextBranchStartIdx].id);
          const nextRowY = rowMeta[nextBranchStartIdx]?.y;
          if (nextFrame && nextRowY != null) {
            const nextCx = frameAnchorX(nextFrame);
            const nextTopY =
              branchDecisionCy(nextFrame) - (nextFrame.parallel ? FORK_GATEWAY_RADIUS : 25);
            const bend = (mBotY + nextTopY) / 2;
            const d =
              Math.abs(nextCx - mCx) < 0.5
                ? `M ${mCx} ${mBotY} L ${nextCx} ${nextTopY}`
                : `M ${mCx} ${mBotY} L ${mCx} ${bend} L ${nextCx} ${bend} L ${nextCx} ${nextTopY}`;
            const outLineType =
              branchLastStep >= 0 ? stepOutgoingArrowLine(rows[branchLastStep]) : "solid";
            edges.push(
              /* @__PURE__ */ h("path", {
                key: `out-if-${f.id}-${rows[nextBranchStartIdx].id}`,
                d,
                fill: "none",
                stroke: theme.stroke,
                strokeWidth: "1.6",
                markerEnd: "url(#arrowhead)",
                ...arrowLineStrokeProps(outLineType),
              }),
            );
          }
        }
        return edges.length > 0 ? /* @__PURE__ */ h("g", { key: `io-${f.id}` }, edges) : null;
      }),
      interactive &&
        selectedRowIndex != null &&
        (() => {
          const bounds = stepRowBounds(selectedRowIndex);
          if (!bounds) return null;
          return /* @__PURE__ */ h(RowSelectionHighlight, {
            key: `sel-${selectedRowIndex}`,
            x: bounds.x,
            y: bounds.y,
            w: bounds.w,
            h: bounds.h,
          });
        })(),
      interactive &&
        rows.map((r, i) => {
          const meta = rowMeta[i];
          if (!meta) return null;
          if (r.kind === "step" && !r.empty && r.role) {
            const bounds = stepRowBounds(i);
            if (!bounds) return null;
            return /* @__PURE__ */ h(RowHitTarget, {
              key: `hit-${i}`,
              rowIndex: i,
              x: bounds.x,
              y: bounds.y,
              w: bounds.w,
              h: bounds.h,
              selected: false,
              onSelect: onRowSelect,
            });
          }
          if (r.kind === "branchStart") {
            const f = frames.find((fr) => fr.id === r.id);
            if (!f) return null;
            const dCx = frameAnchorX(f);
            const dCy = branchDecisionCy(f);
            if (f.parallel) {
              const pad = hitTargetPad;
              const r0 = FORK_GATEWAY_RADIUS;
              return /* @__PURE__ */ h(RowHitTarget, {
                key: `hit-${i}`,
                rowIndex: i,
                x: dCx - r0 - pad,
                y: dCy - r0 - pad,
                w: r0 * 2 + pad * 2,
                h: r0 * 2 + pad * 2,
                selected: selectedRowIndex === i,
                onSelect: onRowSelect,
              });
            }
            const dW = decisionDiamondWidth(f.cond.length);
            const dH = decisionDiamondH;
            return /* @__PURE__ */ h(RowHitTarget, {
              key: `hit-${i}`,
              rowIndex: i,
              x: dCx - dW / 2 - hitTargetDecisionPad,
              y: dCy - dH / 2 - hitTargetDecisionPad,
              w: dW + hitTargetDecisionPad * 2,
              h: dH + hitTargetDecisionPad * 2,
              selected: selectedRowIndex === i,
              onSelect: onRowSelect,
            });
          }
          if (r.kind === "branchCase") {
            const f = frames.find((fr) => fr.cases.some((c2) => c2.startRow === i));
            const c = f?.cases.find((ca) => ca.startRow === i);
            if (!f || !c) return null;
            const { labelX, labelY, labelW } = caseLabelPosition(f, c);
            const edgeD = buildCaseFanOutEdgeD(f, c);
            return /* @__PURE__ */ h(
              "g",
              { key: `hit-${i}` },
              /* @__PURE__ */ h(PathHitTarget, {
                rowIndex: i,
                d: edgeD,
                onSelect: onRowSelect,
              }),
              /* @__PURE__ */ h(RowHitTarget, {
                rowIndex: i,
                x: labelX - labelW / 2 - caseLabelPadX,
                y: labelY - caseLabelPadY,
                w: labelW + caseLabelPadX * 2,
                h: caseLabelHeight,
                selected: selectedRowIndex === i,
                onSelect: onRowSelect,
              }),
            );
          }
          if (r.kind === "branchEnd") {
            const f = frames.find((fr) => fr.endRow === i);
            if (!f || f.yMerge == null) return null;
            const mCx = mergeAnchorX(f);
            const mCy = f.yMerge + mergeH / 2;
            if (f.parallel) {
              const pad = hitTargetPad;
              const r0 = FORK_GATEWAY_RADIUS;
              return /* @__PURE__ */ h(RowHitTarget, {
                key: `hit-${i}`,
                rowIndex: i,
                x: mCx - r0 - pad,
                y: mCy - r0 - pad,
                w: r0 * 2 + pad * 2,
                h: r0 * 2 + pad * 2,
                selected: selectedRowIndex === i,
                onSelect: onRowSelect,
              });
            }
            const mW = mergeNodeW;
            const mH = mergeNodeH;
            return /* @__PURE__ */ h(RowHitTarget, {
              key: `hit-${i}`,
              rowIndex: i,
              x: mCx - mW / 2 - hitTargetMergePad,
              y: mCy - mH / 2 - hitTargetMergePad,
              w: mW + hitTargetMergeExtra,
              h: mH + hitTargetMergeExtra,
              selected: selectedRowIndex === i,
              onSelect: onRowSelect,
            });
          }
          if (r.kind === "branchLoop") {
            const yRow = meta.y ?? 0;
            return /* @__PURE__ */ h(RowHitTarget, {
              key: `hit-${i}`,
              rowIndex: i,
              x: xPad + leftGutter,
              y: yRow,
              w: width - xPad * 2 - leftGutter,
              h: branchLoopH,
              selected: selectedRowIndex === i,
              onSelect: onRowSelect,
            });
          }
          return null;
        }),
      /* @__PURE__ */ h(PrintLayer, {
        theme,
        page,
        title,
        width,
        xPad,
        hasPageHeader,
        pageHeaderY,
        titleY,
        pageDescLines,
        pageDescStartY,
        pageDescLineHeight,
        hasPageFooter,
        height,
      }),
    ),
  );
}
export { renderDiagramSvg };
export { BRANCH_COLOR_STYLES } from "./diagram-layout.js";
