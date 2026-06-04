import {
  Download,
  FilePlus,
  FolderPlus,
  GitBranch,
  HelpCircle,
  LayoutTemplate,
  Save,
  SaveAll,
  Tag,
  Wand2,
} from "lucide-react";

/**
 * Top action bar. Save / Save all / New file / New folder / Export / Templates
 * / Help are always shown when the host supports them; Checkpoint / Flag new
 * version are gated on host capability + method presence.
 */
export function ActionBar({
  counts,
  mode,
  hasUnsavedChanges,
  hasAnyUnsavedChanges,
  readOnly,
  canCreate,
  canMkdir,
  canFormat,
  canCheckpoint,
  canVersion,
  onSave,
  onSaveAll,
  onNewFile,
  onNewFolder,
  onExport,
  onFormat,
  onOpenTemplates,
  onOpenHelp,
  onCheckpoint,
  onFlagVersion,
}) {
  return (
    <div className="sw-actionbar">
      <div className="sw-actionbar-left">
        {canCreate && !readOnly && (
          <button type="button" className="sw-btn" onClick={() => onNewFile()}>
            <FilePlus size={14} /> New file
          </button>
        )}
        {canMkdir && !readOnly && (
          <button type="button" className="sw-btn" onClick={() => onNewFolder()}>
            <FolderPlus size={14} /> New folder
          </button>
        )}
        <button type="button" className="sw-btn" onClick={onOpenTemplates}>
          <LayoutTemplate size={14} /> Templates
        </button>
        {mode === "text" && canFormat && (
          <button type="button" className="sw-btn" onClick={onFormat}>
            <Wand2 size={14} /> Format
          </button>
        )}
      </div>

      <div className="sw-actionbar-counts">
        <span>{counts.roles} roles</span>
        <span className="sw-dot-sep">·</span>
        <span>{counts.blocks} blocks</span>
        <span className="sw-dot-sep">·</span>
        <span>{counts.steps} steps</span>
      </div>

      <div className="sw-actionbar-right">
        <button type="button" className="sw-btn" onClick={onExport} title="Export .txt">
          <Download size={14} /> Export
        </button>
        <button type="button" className="sw-icon-btn" onClick={onOpenHelp} title="Help">
          <HelpCircle size={16} />
        </button>
        {canVersion && (
          <button type="button" className="sw-btn" onClick={onFlagVersion} title="Flag new version">
            <Tag size={14} /> Version
          </button>
        )}
        {canCheckpoint && (
          <button
            type="button"
            className="sw-btn"
            onClick={onCheckpoint}
            disabled={!hasAnyUnsavedChanges}
            title="Checkpoint"
          >
            <GitBranch size={14} /> Checkpoint
          </button>
        )}
        {!readOnly && (
          <>
            <button
              type="button"
              className="sw-btn"
              onClick={onSaveAll}
              disabled={!hasAnyUnsavedChanges}
              title="Save all"
            >
              <SaveAll size={14} /> Save all
            </button>
            <button
              type="button"
              className={`sw-btn ${hasUnsavedChanges ? "sw-btn-accent" : ""}`}
              onClick={onSave}
              disabled={!hasUnsavedChanges}
            >
              <Save size={14} /> {hasUnsavedChanges ? "Save*" : "Save"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
