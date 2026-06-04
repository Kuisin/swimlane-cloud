import { useMemo, useState } from "react";
import { FileEditorProvider } from "./context/file-editor-provider.jsx";
import { useEditor } from "./context/editor-context.js";
import { useLivePreview } from "./hooks/use-live-preview.js";
import { useSplitPane } from "./hooks/use-split-pane.js";
import { hostHas, hostSupportsVersioning } from "./host.js";
import { formatDsl } from "./lib/format-dsl.js";
import { canUseGuiEditing } from "./lib/parse-error-policy.js";
import { mergeSectionTemplate } from "./lib/template-merge.js";
import { modelCounts } from "./components/model-counts.js";
import { ActionBar } from "./components/action-bar.jsx";
import { ModeToggle } from "./components/mode-toggle.jsx";
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
    <FileEditorProvider host={host} projectId={projectId} options={options}>
      <DslEditorInner options={options} />
    </FileEditorProvider>
  );
}

function DslEditorInner({ options }) {
  const editor = useEditor();
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

  const { svg, errors } = useLivePreview(src, { themeKey, theme });
  const { leftPct, containerRef, onDividerMouseDown } = useSplitPane(
    options?.initialSplit ?? 52,
  );

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

  function handleExport() {
    if (typeof document === "undefined") return;
    const name = (activeDocument?.name || "diagram") + ".txt";
    const blob = new Blob([src], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFormat() {
    const result = formatDsl(src);
    if (!result.ok) {
      await dialog.alert("Cannot format: fix parse errors first.");
      return;
    }
    updateActiveDocumentSrc(result.value);
  }

  async function handleCheckpoint() {
    const message = await dialog.prompt("Checkpoint message (optional)", "");
    if (message === null) return;
    await checkpoint(message || undefined);
  }

  async function handleFlagVersion() {
    const name = await dialog.prompt("Version name", "");
    if (!name) return;
    if (hostHas(host, "flagNewVersion")) {
      try {
        await host.flagNewVersion("HEAD", { name });
      } catch (err) {
        await dialog.alert(err?.message || "Could not flag version.");
      }
    }
  }

  function handleInsertTemplate(section, tpl) {
    try {
      const merged = mergeSectionTemplate(src, section, tpl.body);
      updateActiveDocumentSrc(merged);
      setShowTemplates(false);
    } catch (err) {
      dialog.alert(err?.message || "Could not insert template.");
    }
  }

  if (loadError) {
    return <div className="sw-editor sw-fatal">Failed to load: {loadError}</div>;
  }

  return (
    <div className="sw-editor">
      <FolderTree
        files={files}
        activeId={activeDocumentId}
        dirtyIds={dirtyIds}
        selectedDir={selectedDir}
        onSelectDir={(d) => setSelectedDir((cur) => (cur === d ? "" : d))}
        onOpenFile={openFile}
        onNewFile={createNewFile}
        onNewFolder={createNewFolder}
        canCreate={!readOnly && hostHas(host, "create")}
        canMkdir={!readOnly && hostHas(host, "mkdir")}
      />

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
          <ModeToggle
            mode={effectiveMode}
            onChange={setMode}
            guiDisabled={!guiAllowed}
            guiDisabledReason="Fix parse errors to use GUI mode"
          />
          <Tabs
            openDocuments={openDocuments}
            activeId={activeDocumentId}
            dirtyIds={dirtyIds}
            onSelect={setActiveDocumentId}
            onClose={closeDocumentTab}
          />
        </div>

        <div className="sw-split" ref={containerRef}>
          <div className="sw-split-left" style={{ width: `${leftPct}%` }}>
            {!activeDocument ? (
              <div className="sw-gui-empty">
                {isHydrated ? "Open or create a file to start." : "Loading…"}
              </div>
            ) : effectiveMode === "gui" ? (
              <GuiMode src={src} onChange={updateActiveDocumentSrc} readOnly={readOnly} />
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
