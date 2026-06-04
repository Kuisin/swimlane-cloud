/** Default diagram render flags when not set in `/option/` or local editor prefs. */
export const DEFAULT_DIAGRAM_OPTIONS = {
  showLeftGutter: true,
  showRightGutter: true,
  showHeader: true,
  showFooter: true,
  showDescription: true,
  showStepBlockCaptions: true,
  mergeAtPreviousBlock: true,
  branchColorArrows: false,
};

/** DSL kebab keys → model camelCase fields. */
export const DIAGRAM_OPTION_DSL_MAP = {
  "show-left-gutter": "showLeftGutter",
  "show-right-gutter": "showRightGutter",
  "show-header": "showHeader",
  "show-footer": "showFooter",
  "show-description": "showDescription",
  "show-step-block-captions": "showStepBlockCaptions",
  "merge-at-previous-block": "mergeAtPreviousBlock",
  "branch-color-arrows": "branchColorArrows",
};

/** Gutter column headings in `/option/` (stored on `page` in the model). */
export const OPTION_COLUMN_TITLE_DSL_MAP = {
  "left-title": "leftTitle",
  "left-subtitle": "leftSubtitle",
  "right-title": "rightTitle",
  "right-subtitle": "rightSubtitle",
};

export const DEFAULT_COLUMN_TITLES = {
  leftTitle: "Procedure",
  leftSubtitle: "Description",
  rightTitle: "Remark",
  rightSubtitle: "",
};

export const DIAGRAM_OPTION_KEYS = Object.values(DIAGRAM_OPTION_DSL_MAP);
export const OPTION_COLUMN_TITLE_KEYS = Object.values(OPTION_COLUMN_TITLE_DSL_MAP);

export function emptyDiagramOptions() {
  return {};
}

export function hasDiagramOptionContent(options) {
  if (!options) return false;
  return DIAGRAM_OPTION_KEYS.some((key) => options[key] !== undefined);
}

export function hasOptionColumnTitleOverrides(page) {
  if (!page) return false;
  return OPTION_COLUMN_TITLE_KEYS.some(
    (key) => (page[key] ?? DEFAULT_COLUMN_TITLES[key]) !== DEFAULT_COLUMN_TITLES[key],
  );
}

export function hasOptionSectionContent(model) {
  return (
    hasDiagramOptionContent(model?.options) ||
    hasOptionColumnTitleOverrides(model?.page)
  );
}

/** @param {string} raw */
export function parseOptionBoolean(raw) {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (["true", "yes", "on", "1"].includes(v)) return true;
  if (["false", "no", "off", "0"].includes(v)) return false;
  return null;
}

/**
 * Merge `/option/` (when present) over local editor defaults.
 * Only keys explicitly set in `modelOptions` override locals.
 */
export function resolveDiagramOptions(modelOptions, localOverrides = {}) {
  const resolved = {
    ...DEFAULT_DIAGRAM_OPTIONS,
    ...localOverrides,
  };
  if (!modelOptions) return resolved;
  for (const key of DIAGRAM_OPTION_KEYS) {
    if (modelOptions[key] !== undefined) {
      resolved[key] = modelOptions[key];
    }
  }
  return resolved;
}
