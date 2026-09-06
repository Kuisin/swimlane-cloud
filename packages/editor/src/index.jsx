/**
 * @swimlane-cloud/editor — the shared DSL editor surface.
 *
 * Public entry. Consumers also import the stylesheet:
 *   import "@swimlane-cloud/editor/styles.css";
 */
export { DslEditor } from "./dsl-editor.jsx";
export { FileEditorProvider } from "./context/file-editor-provider.jsx";
export { useEditor } from "./context/editor-context.js";

// In-app alert/confirm/prompt modal, replacing native browser dialogs.
// Exported so a host app can reuse the same themed dialogs outside the
// editor surface (e.g. apps/saas pages that aren't rendering <DslEditor>).
export { DialogHost } from "./components/dialog-host.jsx";
export { useDialogHost } from "./hooks/use-dialog-host.js";

// EditorHost contract + capability helpers.
export {
  TEMPLATE_SECTIONS,
  hostHas,
  hostSupportsVersioning,
  hostAutosaves,
  hostIsReadOnly,
} from "./host.js";

// Pure libs, useful to host adapters and tests.
export { serializeDSL } from "./lib/serialize-dsl.js";
export { formatDsl } from "./lib/format-dsl.js";
export { mergeSectionTemplate } from "./lib/template-merge.js";
export {
  DEFAULT_TAB_TEMPLATE,
  isDocumentDirty,
  createDocument,
  normalizeNewTxtRelPath,
  normalizeDirPath,
} from "./lib/dsl-document.js";
export { buildFolderTree } from "./lib/folder-tree.js";
export { clearLocalMirror } from "./lib/local-mirror.js";
export { parseGuiModel, applyModelEdit } from "./lib/gui-model.js";
export {
  cacheKey,
  fetchImports,
  missingImports,
  resolversFrom,
  withEntries,
} from "./lib/import-cache.js";
export { extractPartsCode } from "./lib/parts-extract.js";
export {
  findAdjacentStepIndex,
  moveRow,
  sameReorderFrame,
  getFrameStepIndices,
} from "./lib/flow-rows.js";

// i18n (English + Japanese). Consumers can seed the language via
// <DslEditor options={{ lang: "ja" }} /> or read/switch it with useT().
export { LanguageProvider, useT, LANGUAGES } from "./i18n.jsx";
