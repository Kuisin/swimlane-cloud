/**
 * Diagram SVG layout constants — single place to tune margins, gutters, spacing,
 * and sizing for swimlane diagram rendering.
 */

/** Branch case label colors (stroke + background). */
export const BRANCH_COLOR_STYLES = {
  blue: { stroke: "#2563eb", bg: "#dbeafe" },
  green: { stroke: "#15803d", bg: "#dcfce7" },
  red: { stroke: "#b91c1c", bg: "#fee2e2" },
  orange: { stroke: "#c2410c", bg: "#ffedd5" },
  purple: { stroke: "#7e22ce", bg: "#f3e8ff" },
  gray: { stroke: "#374151", bg: "#f3f4f6" },
  black: { stroke: "#111827", bg: "#e5e7eb" },
  pink: { stroke: "#be185d", bg: "#fce7f3" },
  teal: { stroke: "#0f766e", bg: "#ccfbf1" },
  yellow: { stroke: "#a16207", bg: "#fef9c3" },
};

/** Parallel fork gateway circle radius. */
export const FORK_GATEWAY_RADIUS = 14;

/** Block caption width factors by shape (display columns). */
export const BLOCK_SHAPE_WIDTH_FACTOR = {
  rounded: 11,
  rect: 11,
  note: 11,
  hex: 11,
  if: 6,
  subroutine: 9,
  ellipse: 7,
  cloud: 9,
};

export const BLOCK_ICON_COLS = 1.6;
export const BLOCK_MIN_TEXT_COLS = 3;

/** Step block shape drawing (render-pure/step-shape.js). */
export const STEP_SHAPE = {
  strokeWidth: 1.3,
  hexChamfer: 14,
  noteFold: 10,
  subroutineInset: 10,
  subroutineCornerRadius: 4,
};

/** Main diagram layout — margins, gutters, row/grid spacing, branch geometry. */
export const DIAGRAM_LAYOUT = {
  // Page margins & gutters
  xPad: 40,
  leftGutterWidth: 300,
  rightGutterWidth: 240,
  gutterInnerPad: 12,
  baseBottomPadding: 64,
  gridBottomPad: 24,
  gridBottomPadWithFooter: 52,
  pageFooterPad: 44,
  pageFooterTextY: 12,

  // Top / print header area
  topPadDefault: 40,
  topPadWithTitleOnly: 84,
  titleYWithTitleOnly: 48,
  topPadMinWithTitle: 84,
  topPadMinDefault: 40,
  printLayoutStartY: 18,
  pageHeaderTextOffset: 12,
  pageHeaderBlockHeight: 32,
  titleTextOffset: 24,
  titleBlockHeight: 38,
  pageDescStartOffset: 10,
  pageDescBlockTrailing: 18,
  topPadTrailing: 20,
  pageDescWrapCols: 48,

  // Swimlane grid
  headerH: 72,
  rowStartBelowHeader: 40,
  nodeW: 188,
  rowH: 80,
  laneContentPad: 15,
  sectionInset: 5,
  // Horizontal padding reserved on the outermost lanes so step/branch content
  // and the side-routed arrows don't crowd the gutter dividers or sit on top of
  // a section's left/right border.
  outerLanePad: 26,
  // Gap from the lane-grid edge to the *outermost* section border, and the extra
  // inset added per nesting level. Sized so the arrow rails (which route at the
  // grid edge) clear the border, and nested sections stay visually distinct.
  sectionEdgeInset: 18,
  sectionNestStep: 12,

  // Left / right gutter text
  remarkWrapColsMin: 8,
  descriptionLineHeight: 14,
  descriptionBottomPad: 10,
  gutterTextBaselineY: 30,
  gutterTitleLineH: 20,
  gutterTextBandTopY: 20,
  gutterHeaderTitleFontSize: 13,
  gutterHeaderSubtitleFontSize: 11,
  gutterStepTitleFontSize: 12,
  gutterBodyFontSize: 10,

  // Step blocks & props
  stepBoxH: 44,
  docW: 65,
  docH: 40,
  docGapX: 8,
  docGapY: 18,
  propRowExtraHBase: 20,
  propDefaultMaxChars: 9,
  propDocFold: 8,
  propDocTextY: 12,
  propDocFontSize: 9,
  stepPropRightExtentBase: 60,
  stepPropLeftExtentBase: 55,
  stepConnectorLabelOffsetY: 8,
  stepDocIconOffsetY: 8,

  // Branch / decision / merge
  caseSpread: 100,
  caseClearance: 10,
  caseCollisionShift: 40,
  diamondH: 90,
  decisionDiamondH: 50,
  decisionMinWidth: 140,
  decisionWidthCharFactor: 9,
  decisionWidthPadding: 4,
  decisionTextOffsetY: 4,
  mergeH: 60,
  mergeNodeW: 40,
  mergeNodeH: 28,
  mergeArrowClearance: 4,
  branchLoopH: 12,
  branchMergeH: 12,
  groupMarkerH: 16,
  decisionYOffset: -15,
  branchCaseBendYOffset: 10,
  caseLabelOffsetY: 18,
  caseLabelHeight: 28,
  caseLabelPadX: 8,
  caseLabelPadY: 14,
  caseLabelCharWidth: 8.5,
  caseLaneSafeInset: 16,
  branchConnectorElbowThreshold: 0.5,

  // Loop routing
  loopDropPad: 14,

  // Terminals (start / end circles)
  terminalGap: 28,
  terminalRadius: 5,
  startTerminalInset: 16,
  endTerminalBottomPad: 16,

  // Connector routing
  connectorBendMinGap: 12,
  connectorBendMaxInset: 16,
  connectorGroupBendMinGap: 12,
  connectorGroupBendMaxInset: 16,

  // Page description typography
  pageDescLineHeight: 16,

  // Text width estimation (lane header sizing)
  estimateTextWidthBase: 28,
  estimateTextWidthHalfWidth: 8,
  estimateTextWidthFullWidth: 14,
  laneHeaderWidthWithIcon: 88,
  laneHeaderWidthNoIcon: 64,

  // Interactive hit targets
  hitTargetPad: 12,
  hitTargetDecisionPad: 12,
  hitTargetMergePad: 10,
  hitTargetMergeExtra: 20,

  // Selection / interaction chrome
  selectionFill: "#2563eb",
  selectionFillOpacity: 0.1,
  selectionStrokeWidth: 2,
  selectionCornerRadius: 6,
  hitTargetStrokeWidth: 2.5,
  hitTargetCornerRadius: 4,
  pathHitStrokeWidth: 18,

  // Typography (SVG text)
  triColumnFontSize: 11,
  titleFontSize: 24,
  pageDescFontSize: 13,
  decisionFontSize: 13,
  fontFamily: "'Noto Sans JP','Noto Sans',sans-serif",
  decisionFontFamily: "'Noto Sans JP',sans-serif",
};

/**
 * Display-column budget for text inside a gutter of `gutterWidth` px: the
 * usable width after inner padding on both sides, divided by the font size
 * (one column = one full-width CJK cell = 1em at that font size).
 */
export function gutterTextCols(gutterWidth, fontSize) {
  const { gutterInnerPad } = DIAGRAM_LAYOUT;
  return Math.max(1, Math.floor((gutterWidth - 2 * gutterInnerPad) / fontSize));
}

export function blockMaxTextCols(shape, hasIcon) {
  const factor = BLOCK_SHAPE_WIDTH_FACTOR[shape] ?? 1;
  return Math.max(BLOCK_MIN_TEXT_COLS, Math.round(factor) - (hasIcon ? BLOCK_ICON_COLS : 0));
}

export function decisionDiamondWidth(condLength) {
  const { decisionMinWidth, decisionWidthPadding, decisionWidthCharFactor } = DIAGRAM_LAYOUT;
  return Math.max(decisionMinWidth, (condLength + decisionWidthPadding) * decisionWidthCharFactor);
}
