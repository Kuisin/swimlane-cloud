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
  showGatewayIcons: true,
  blockMargin: 0,
  blockText: "truncate",
};

/** DSL kebab keys → model camelCase fields, for the true/false options. */
export const DIAGRAM_OPTION_DSL_MAP = {
  "show-left-gutter": "showLeftGutter",
  "show-right-gutter": "showRightGutter",
  "show-header": "showHeader",
  "show-footer": "showFooter",
  "show-description": "showDescription",
  "show-step-block-captions": "showStepBlockCaptions",
  "merge-at-previous-block": "mergeAtPreviousBlock",
  "branch-color-arrows": "branchColorArrows",
  "show-gateway-icons": "showGatewayIcons",
};

export const BLOCK_TEXT_MODES = ["truncate", "wrap"];
export const BLOCK_MARGIN_MAX = 80;

/**
 * DSL kebab keys → model fields for the options that are not booleans. Each
 * `parse` returns the stored value, or `null` with `expected` describing what
 * would have been accepted; `format` writes the stored value back out when it
 * is not simply its own string form.
 *
 * Declaration order is emission order — dsl-rule.md's canonical `/option/`
 * order puts `lane-order` before `block-margin, block-text`.
 */
export const DIAGRAM_OPTION_VALUE_MAP = {
  "lane-order": {
    field: "laneOrder",
    expected: "a comma-separated list of role ids",
    parse(raw) {
      const ids = String(raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      // Written once, so a repeated id is the author saying the same thing
      // twice; the first mention decides the position.
      const out = [...new Set(ids)];
      return out.length ? out : null;
    },
    format: (value) => (Array.isArray(value) ? value.join(", ") : String(value)),
  },
  "block-margin": {
    field: "blockMargin",
    expected: `a whole number of pixels from 0 to ${BLOCK_MARGIN_MAX}`,
    parse(raw) {
      const n = Number(String(raw ?? "").trim());
      return Number.isInteger(n) && n >= 0 && n <= BLOCK_MARGIN_MAX ? n : null;
    },
  },
  "block-text": {
    field: "blockText",
    expected: BLOCK_TEXT_MODES.join(" or "),
    parse(raw) {
      const v = String(raw ?? "")
        .trim()
        .toLowerCase();
      return BLOCK_TEXT_MODES.includes(v) ? v : null;
    },
  },
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

export const DIAGRAM_OPTION_KEYS = [
  ...Object.values(DIAGRAM_OPTION_DSL_MAP),
  ...Object.values(DIAGRAM_OPTION_VALUE_MAP).map((v) => v.field),
];
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
  return hasDiagramOptionContent(model?.options) || hasOptionColumnTitleOverrides(model?.page);
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
 * Only keys explicitly set in `modelOptions` override locals — so a
 * repository-wide setting applies to every diagram that does not say
 * otherwise in its own file.
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
