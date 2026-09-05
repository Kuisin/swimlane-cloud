import { useMemo, useState } from "react";
import { FileEditorProvider } from "./context/file-editor-provider.jsx";
import { useEditor } from "./context/editor-context.js";
import { useLivePreview } from "./hooks/use-live-preview.js";
import { useSplitPane } from "./hooks/use-split-pane.js";
import { useDragWidth } from "./hooks/use-drag-width.js";
import { usePersistentState } from "./hooks/use-persistent-state.js";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts.js";
import { hostHas, hostSupportsVersioning } from "./host.js";
import { LanguageProvider, useT } from "./i18n.jsx";
import { formatDsl } from "./lib/format-dsl.js";
import { canUseGuiEditing } from "./lib/parse-error-policy.js";
import { mergeSectionTemplate } from "./lib/template-merge.js";
import { modelCounts } from "./components/model-counts.js";
import { shortcutLabel } from "./lib/platform.js";
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
 *
 * `dialogs` overrides the default window.alert/confirm/prompt implementations.
 * Shells where those are unavailable or disabled — a VS Code webview, for
 * instance — must pass their own, or New file / Delete / Checkpoint silently
 * do nothing. Omit it in a normal browser to keep the window-based defaults.
 */
export function DslEditor({ host, projectId, options, dialogs }) {
  return (
    <LanguageProvider defaultLang={options?.lang}>
      <FileEditorProvider host={host} projectId={projectId} options={options} dialogs={dialogs}>
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
    autosave,
    autosaveStatus,
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
    deleteFile,
    deleteFolder,
    moveFile,
    checkpoint,
    policies,
    dialog,
  } = editor;

  const [mode, setMode] = usePersistentState("sw-editor:mode", options?.initialMode || "text");
  const [selectedDir, setSelectedDir] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [gotoLine, setGotoLine] = useState(null);
  const [treeCollapsed, setTreeCollapsed] = usePersistentState("sw-editor:tree-collapsed", false, {
    parse: (v) => v === "true",
  });

  const { svg, errors } = useLivePreview(src, { themeKey, theme });
  const { leftPct, containerRef, onDividerMouseDown } = useSplitPane(options?.initialSplit ?? 52, {
    storageKey: "sw-editor:split-pct",
  });
  const tree = useDragWidth(options?.initialTreeWidth ?? 240, {
    min: 160,
    max: 480,
    edge: "right",
    storageKey: "sw-editor:tree-w",
  });

  const counts = useMemo(() => modelCounts(model), [model]);
  const dirtyIds = useMemo(
    () =>
      new Set(
        documents.filter((d) => d.src !== d.savedSrc || d.needsInitialDiskSave).map((d) => d.id),
      ),
    [documents],
  );

  const guiAllowed = canUseGuiEditing(model.errors, activeParseErrorPolicy);
  const effectiveMode = mode === "gui" && !guiAllowed ? "text" : mode;

  const shortcuts = useMemo(
    () => ({
      save: shortcutLabel("s", { mod: true }),
      saveAll: shortcutLabel("s", { mod: true, shift: true }),
      format: shortcutLabel("f", { mod: true, shift: true }),
      help: "?",
    }),
    [],
  );

  useKeyboardShortcuts([
    {
      key: "s",
      mod: true,
      shift: false,
      enabled: !readOnly && hasUnsavedChanges,
      handler: () => saveDocuments(),
    },
    {
      key: "s",
      mod: true,
      shift: true,
      enabled: !readOnly && hasAnyUnsavedChanges,
      handler: () => saveAllDocuments(),
    },
    {
      key: "?",
      mod: false,
      // shift is left undefined — "?" already encodes the shift state in e.key
      handler: () => setShowHelp(true),
    },
    {
      key: "Escape",
      mod: false,
      shift: false,
      handler: () => {
        if (showHelp) setShowHelp(false);
        else if (showTemplates) setShowTemplates(false);
      },
    },
    {
      key: "f",
      mod: true,
      shift: true,
      enabled: effectiveMode === "text" && model.errors.length === 0,
      handler: handleFormat,
    },
  ]);

  function handleExport(format) {
    if (typeof document === "undefined") return;
    const baseName = activeDocument?.name || "diagram";

    const triggerDownload = (blob, ext) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    if (format === "txt") {
      triggerDownload(new Blob([src], { type: "text/plain;charset=utf-8" }), "txt");
      return;
    }

    if (!svg) return;

    // The live SVG uses style="width:100%;height:auto", which (a) leaves an
    // <img> with no intrinsic size → a blank/cropped PNG, and (b) can render
    // oddly when the .svg is opened standalone. Pin explicit pixel dimensions
    // (from the viewBox) on both the style and the width/height attributes.
    const vb = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(svg);
    const w = vb ? Math.round(parseFloat(vb[1])) : 0;
    const h = vb ? Math.round(parseFloat(vb[2])) : 0;
    let outSvg = svg;
    if (w > 0 && h > 0) {
      outSvg = svg.replace(/<svg\b[^>]*>/, (tag) => {
        let t = tag.replace(/\swidth="[^"]*"/i, "").replace(/\sheight="[^"]*"/i, "");
        if (/style="/i.test(t)) {
          t = t.replace(/style="([^"]*)"/i, (_m, st) => {
            const cleaned = st
              .replace(/width\s*:\s*[^;"]*;?/i, "")
              .replace(/height\s*:\s*[^;"]*;?/i, "");
            return `style="width:${w}px;height:${h}px;${cleaned}"`;
          });
        }
        return t.replace(/<svg\b/, `<svg width="${w}" height="${h}"`);
      });
    }

    if (format === "svg") {
      triggerDownload(new Blob([outSvg], { type: "image/svg+xml;charset=utf-8" }), "svg");
      return;
    }

    if (format === "png" || format === "png-hd") {
      // A blob URL is reliable across browsers for SVG → <img> → canvas; an SVG
      // data URL fails to load in Safari, which is why PNG export was breaking.
      const targetScale = format === "png-hd" ? 4 : 2;
      const svgUrl = URL.createObjectURL(
        new Blob([outSvg], { type: "image/svg+xml;charset=utf-8" }),
      );
      const img = new Image();
      img.onload = () => {
        const baseW = w || img.naturalWidth || 800;
        const baseH = h || img.naturalHeight || 600;
        // Browsers cap canvas size (Safari rasterizes nothing past ~16.7M px of
        // area / 8k per side, returning a blank canvas + null toBlob; Chrome/
        // Firefox go much higher). A fixed scale blows that on large diagrams —
        // which is why a small diagram exports but a big one fails. Pick the
        // largest scale up to the target that still fits, so large diagrams
        // downscale gracefully instead of going blank.
        const isSafari =
          typeof navigator !== "undefined" &&
          /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent);
        const MAX_DIM = isSafari ? 8192 : 16384;
        const MAX_AREA = isSafari ? 16777216 : 268435456; // 4096² / 16384²
        let scale = Math.min(targetScale, MAX_DIM / baseW, MAX_DIM / baseH);
        scale = Math.min(scale, Math.sqrt(MAX_AREA / (baseW * baseH)));
        if (!(scale > 0) || !Number.isFinite(scale)) scale = 1;
        const cw = Math.max(1, Math.floor(baseW * scale));
        const ch = Math.max(1, Math.floor(baseH * scale));
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(svgUrl);
        try {
          canvas.toBlob((blob) => {
            if (blob) triggerDownload(blob, "png");
            else dialog.alert(t("dlg.pngFailed"));
          }, "image/png");
        } catch {
          dialog.alert(t("dlg.pngFailed"));
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        dialog.alert(t("dlg.pngFailed"));
      };
      img.src = svgUrl;
    }
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
    // Loose null: an injected dialog backed by vscode.window.showInputBox
    // resolves to `undefined` on cancel, not null. Strict === would treat a
    // cancelled prompt as an empty message and create the checkpoint anyway.
    // Matches file-editor-provider.jsx:319,431.
    if (message == null) return;
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
        onDeleteFile={deleteFile}
        onDeleteFolder={deleteFolder}
        onMoveFile={moveFile}
        canCreate={!readOnly && hostHas(host, "create")}
        canMkdir={!readOnly && hostHas(host, "mkdir")}
        canDelete={!readOnly && hostHas(host, "delete")}
        canMove={!readOnly && hostHas(host, "rename")}
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
          autosave={autosave}
          autosaveStatus={autosaveStatus}
          canCheckpoint={!autosave && hostHas(host, "checkpoint")}
          canVersion={!autosave && hostSupportsVersioning(host) && hostHas(host, "flagNewVersion")}
          hasSvg={Boolean(svg)}
          shortcuts={shortcuts}
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
          {options?.showLanguageToggle !== false && <LanguageToggle />}
        </div>

        {effectiveMode === "gui" && activeDocument ? (
          // GUI mode owns a 3-column layout (step list | detail | preview) so
          // the step list and detail panel each resize independently and the
          // preview absorbs the slack. Text mode keeps the editor⇄preview split.
          <GuiMode
            src={src}
            onChange={updateActiveDocumentSrc}
            readOnly={readOnly}
            theme={theme}
            svg={svg}
            errors={errors}
          />
        ) : (
          <div className="sw-split" ref={containerRef}>
            <div className="sw-split-left" style={{ width: `${leftPct}%` }}>
              {!activeDocument ? (
                <div className="sw-gui-empty">
                  {isHydrated ? t("gui.openFile") : t("common.loading")}
                </div>
              ) : (
                <TextEditor
                  value={src}
                  onChange={updateActiveDocumentSrc}
                  readOnly={readOnly}
                  gotoLine={gotoLine}
                  theme={theme}
                  errors={errors}
                />
              )}
              <ErrorList errors={errors} onSelectLine={(line) => setGotoLine(line)} />
            </div>

            <div
              className="sw-resizer"
              role="separator"
              aria-orientation="vertical"
              onMouseDown={onDividerMouseDown}
              onTouchStart={onDividerMouseDown}
            />

            <div className="sw-split-right sw-preview-pane" style={{ width: `${100 - leftPct}%` }}>
              <PreviewPane svg={svg} hasErrors={errors?.length > 0} />
            </div>
          </div>
        )}
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
