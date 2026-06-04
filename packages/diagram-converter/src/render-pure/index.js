// Public entry point: `@kai-swimlane/core/render-pure`.
// Dependency-free string renderers (no React) for headless/server use and
// external plugins. The React components live in the main barrel
// (`@kai-swimlane/core`).

export { renderDiagramSvg, BRANCH_COLOR_STYLES } from "./diagram.js";
export { renderStepShape, StepShape } from "./step-shape.js";
export { renderBlockIcon, BlockIcon } from "./block-icon.js";
export { renderPartsPreviewHtml } from "./parts-preview-static.js";
export { renderTemplatePartsPreviewHtml } from "./template-parts-preview.js";
export { textToSvg } from "./text-to-svg.js";
