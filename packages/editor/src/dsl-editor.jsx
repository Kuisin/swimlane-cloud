import { useMemo, useState } from "react";
import { FileEditorProvider } from "./context/file-editor-provider.jsx";
import { useEditor } from "./context/editor-context.js";
import { useLivePreview } from "./hooks/use-live-preview.js";
import { useSplitPane } from "./hooks/use-split-pane.js";
import { useDragWidth } from "./hooks/use-drag-width.js";
import { hostHas, hostSupportsVersioning } from "./host.js";
import { LanguageProvider, useT } from "./i18n.jsx";
import { formatDsl } from "./lib/format-dsl.js";
import { canUseGuiEditing } from "./lib/parse-error-policy.js";
import { mergeSectionTemplate } from "./lib/template-merge.js";
import { modelCounts } from "./components/model-counts.js";
import { ActionBar } from "./components/action-bar.jsx";
import { ModeToggle } from "./components/mode-toggle.jsx";
import { LanguageToggle } from "./components/language-toggle.jsx";
import { Tabs } from "./components/tabs.jsx";
import { FolderTree } from "./components/folder-tree.jsx";
import { TextEditor } from "./components/text-editor.jsx";
import { PreviewPane } from "./components/preview-pane.jsx";
import { ErrorList } from "./components/error-list.jsx";
import { HelpModal } from "./components/help-modal.jsx";
import { TemplatePanel } from "./components/template-panel.jsx";
import { GuiMode } from "./components/gui/gui-mode.jsx";

/**
 * The shared DSL editor surface. Mounts a folder tree + tabs, a resizable split
 * pane (editor left, live SVG preview right), GUI ⇄ Text mode over one DSL
 * document, an error list, and a capability-gated action bar. All persistence
 * flows through the `host` prop — the editor knows nothing about git, auth,
 * networking, Electron, or the file system.
 */
export function DslEditor({ host, projectId, options }) {
  return (
    <LanguageProvider defaultLang={options?.lang}>
      <FileEditorProvider host={host} projectId={projectId} options={options}>
        <DslEditorInner options={options} />
      </FileEditorProvider>
    </LanguageProvider>
  );
}

function DslEditorInner({ options }) {
  const editor = useEditor();
  const { t } = useT();
  const {
    host,
    readOnly,
    isHydrated,
    loadError,
    files,
    documents,
    openDocuments,
    activeDocument,
    activeDocumentId,
    setActiveDocumentId,
    openFile,
    closeDocumentTab,
    themeKey,
    theme,
    src,
    model,
    activeParseErrorPolicy,
    hasUnsavedChanges,
    hasAnyUnsavedChanges,
    updateActiveDocumentSrc,
    replaceActiveDocumentSrc,
    saveDocuments,
    saveAllDocuments,
    createNewFile,
    createNewFolder,
    checkpoint,
    policies,
    dialog,
  } = editor;

  const [mode, setMode] = useState(options?.initialMode || "text");
  const [selectedDir, setSelectedDir] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [gotoLine, setGotoLine] = useState(null);
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  const { svg, errors } = useLivePreview(src, { themeKey, theme });
  const { leftPct, containerRef, onDividerMouseDown } = useSplitPane(
    options?.initialSplit ?? 52,
  );
  const tree = useDragWidth(options?.initialTreeWidth ?? 240, {
    min: 160,
    max: 480,
    edge: "right",
  });

  const counts = useMemo(() => modelCounts(model), [model]);
  const dirtyIds = useMemo(
    () =>
      new Set(
        documents
          .filter((d) => d.src !== d.savedSrc || d.needsInitialDiskSave)
          .map((d) => d.id),
      ),
    [documents],
  );

  const guiAllowed = canUseGuiEditing(model.errors, activeParseErrorPolicy);
  const effectiveMode = mode === "gui" && !guiAllowed ? "text" : mode;

  function handleExport(format) {
    if (typeof document === "undefined") return;
    const baseName = activeDocument?.name || "diagram";

    if (format === "svg") {
      if (!svg) return;
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = baseName + ".svg";
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (format === "png") {
      if (!svg) return;
      const img = new Image();
      const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);
      img.onload = () => {
        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth * scale;
        canvas.height = img.naturalHeight * scale;
        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(svgUrl);
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = baseName + ".png";
          a.click();
          URL.revokeObjectURL(url);
        }, "image/png");
      };
      img.src = svgUrl;
      return;
    }

    // default: txt
    const blob = new Blob([src], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = baseName + ".txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFormat() {
    const result = formatDsl(src);
    if (!result.ok) {
      await dialog.alert(t("dlg.cannotFormat"));
      return;
    }
    updateActiveDocumentSrc(result.value);
  }

  async function handleCheckpoint() {
    const message = await dialog.prompt(t("dlg.checkpointMsg"), "");
    if (message === null) return;
    await checkpoint(message || undefined);
  }

  async function handleFlagVersion() {
    const name = await dialog.prompt(t("dlg.versionName"), "");
    if (!name) return;
    if (hostHas(host, "flagNewVersion")) {
      try {
        await host.flagNewVersion("HEAD", { name });
      } catch (err) {
        await dialog.alert(err?.message || t("dlg.versionFail"));
      }
    }
  }

  function handleInsertTemplate(section, tpl) {
    try {
      const merged = mergeSectionTemplate(src, section, tpl.body);
      updateActiveDocumentSrc(merged);
      setShowTemplates(false);
    } catch (err) {
      dialog.alert(err?.message || t("dlg.templateFail"));
    }
  }

  if (loadError) {
    return <div className="sw-editor sw-fatal">{t("fatal.load", { msg: loadError })}</div>;
  }

  return (
    <div className="sw-editor">
      <FolderTree
        files={files}
        width={treeCollapsed ? 0 : tree.width}
        activeId={activeDocumentId}
        dirtyIds={dirtyIds}
        selectedDir={selectedDir}
        collapsed={treeCollapsed}
        onSelectDir={(d) => setSelectedDir((cur) => (cur === d ? "" : d))}
        onOpenFile={openFile}
        onNewFile={createNewFile}
        onNewFolder={createNewFolder}
        canCreate={!readOnly && hostHas(host, "create")}
        canMkdir={!readOnly && hostHas(host, "mkdir")}
        onToggleCollapse={() => setTreeCollapsed((v) => !v)}
      />
      {!treeCollapsed && (
        <div
          className="sw-resizer"
          role="separator"
          aria-orientation="vertical"
          onMouseDown={tree.startDrag}
          onTouchStart={tree.startDrag}
        />
      )}

      <div className="sw-main">
        <ActionBar
          counts={counts}
          mode={effectiveMode}
          hasUnsavedChanges={hasUnsavedChanges}
          hasAnyUnsavedChanges={hasAnyUnsavedChanges}
          readOnly={readOnly}
          canCreate={hostHas(host, "create")}
          canMkdir={hostHas(host, "mkdir")}
          canFormat={model.errors.length === 0}
          canCheckpoint={hostHas(host, "checkpoint")}
          canVersion={hostSupportsVersioning(host) && hostHas(host, "flagNewVersion")}
          hasSvg={Boolean(svg)}
          onSave={() => saveDocuments()}
          onSaveAll={saveAllDocuments}
          onNewFile={() => createNewFile(selectedDir)}
          onNewFolder={() => createNewFolder(selectedDir)}
          onExport={handleExport}
          onFormat={handleFormat}
          onOpenTemplates={() => setShowTemplates(true)}
          onOpenHelp={() => setShowHelp(true)}
          onCheckpoint={handleCheckpoint}
          onFlagVersion={handleFlagVersion}
        />

        <div className="sw-subbar">
          <ModeToggle mode={effectiveMode} onChange={setMode} guiDisabled={!guiAllowed} />
          <Tabs
            openDocuments={openDocuments}
            activeId={activeDocumentId}
            dirtyIds={dirtyIds}
            onSelect={setActiveDocumentId}
            onClose={closeDocumentTab}
          />
          <LanguageToggle />
        </div>

        <div className="sw-split" ref={containerRef}>
          <div className="sw-split-left" style={{ width: `${leftPct}%` }}>
            {!activeDocument ? (
              <div className="sw-gui-empty">
                {isHydrated ? t("gui.openFile") : t("common.loading")}
              </div>
            ) : effectiveMode === "gui" ? (
              <GuiMode
                src={src}
                onChange={updateActiveDocumentSrc}
                readOnly={readOnly}
                theme={theme}
              />
            ) : (
              <TextEditor
                value={src}
                onChange={updateActiveDocumentSrc}
                readOnly={readOnly}
                gotoLine={gotoLine}
              />
            )}
            <ErrorList errors={errors} onSelectLine={(line) => setGotoLine(line)} />
          </div>

          <div
            className="sw-divider"
            role="separator"
            aria-orientation="vertical"
            onMouseDown={onDividerMouseDown}
            onTouchStart={onDividerMouseDown}
          />

          <div className="sw-split-right" style={{ width: `${100 - leftPct}%` }}>
            <PreviewPane svg={svg} hasErrors={errors?.length > 0} />
          </div>
        </div>
      </div>

      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
      <TemplatePanel
        open={showTemplates}
        host={host}
        theme={theme}
        policies={policies}
        onClose={() => setShowTemplates(false)}
        onInsert={handleInsertTemplate}
      />
    </div>
  );
}
