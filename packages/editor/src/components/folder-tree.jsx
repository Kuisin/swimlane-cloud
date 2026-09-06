import { useRef, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
} from "lucide-react";
import { buildFolderTree } from "../lib/folder-tree.js";
import { StarterGallery } from "./gui/starter-gallery.jsx";
import { useT } from "../i18n.jsx";

/**
 * Nested folder tree built by splitting each FileRef.id on "/". Clicking a file
 * opens it; "New file"/"New folder" act under the selected folder. Delete buttons
 * appear on hover. Files are draggable onto folders to move them.
 * When `collapsed` is true, only a thin strip with an expand button is shown.
 */
export function FolderTree({
  files,
  width,
  activeId,
  dirtyIds,
  selectedDir,
  collapsed,
  onSelectDir,
  onOpenFile,
  onNewFile,
  onNewFileFromStarter,
  onNewFolder,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  canCreate,
  canMkdir,
  canDelete,
  canMove,
  onToggleCollapse,
}) {
  const { t } = useT();
  const tree = useMemo(() => buildFolderTree(files), [files]);
  const [rootDragOver, setRootDragOver] = useState(false);
  const [showStarters, setShowStarters] = useState(false);
  const rootDragCount = useRef(0);

  if (collapsed) {
    return (
      <div className="sw-tree-collapsed">
        <button
          type="button"
          className="sw-icon-btn"
          title={t("tree.expand")}
          onClick={onToggleCollapse}
        >
          <PanelLeftOpen size={16} />
        </button>
      </div>
    );
  }

  function handleRootDragOver(e) {
    if (!canMove) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleRootDragEnter(e) {
    if (!canMove) return;
    e.preventDefault();
    rootDragCount.current++;
    setRootDragOver(true);
  }

  function handleRootDragLeave() {
    if (!canMove) return;
    rootDragCount.current--;
    if (rootDragCount.current === 0) setRootDragOver(false);
  }

  function handleRootDrop(e) {
    e.preventDefault();
    rootDragCount.current = 0;
    setRootDragOver(false);
    if (!canMove) return;
    const fromId = e.dataTransfer.getData("text/plain");
    if (!fromId || !fromId.includes("/")) return;
    const fileName = fromId.split("/").pop();
    onMoveFile(fromId, fileName);
  }

  return (
    <div className="sw-tree" style={width ? { width, flex: "0 0 auto" } : undefined}>
      <div className="sw-tree-header">
        <span className="sw-tree-title">{t("tree.files")}</span>
        <span className="sw-tree-actions">
          {canCreate && (
            <button
              type="button"
              className="sw-icon-btn"
              title={t("action.newFile")}
              onClick={() => onNewFile(selectedDir)}
            >
              <FilePlus size={14} />
            </button>
          )}
          {canMkdir && (
            <button
              type="button"
              className="sw-icon-btn"
              title={t("action.newFolder")}
              onClick={() => onNewFolder(selectedDir)}
            >
              <FolderPlus size={14} />
            </button>
          )}
          <button
            type="button"
            className="sw-icon-btn"
            title={t("tree.collapse")}
            onClick={onToggleCollapse}
          >
            <PanelLeftClose size={14} />
          </button>
        </span>
      </div>
      <div
        className={`sw-tree-body${rootDragOver ? " sw-tree-drag-over" : ""}`}
        onDragOver={handleRootDragOver}
        onDragEnter={handleRootDragEnter}
        onDragLeave={handleRootDragLeave}
        onDrop={handleRootDrop}
      >
        <TreeNode
          node={tree}
          depth={0}
          activeId={activeId}
          dirtyIds={dirtyIds}
          selectedDir={selectedDir}
          onSelectDir={onSelectDir}
          onOpenFile={onOpenFile}
          onDeleteFile={onDeleteFile}
          onDeleteFolder={onDeleteFolder}
          onMoveFile={onMoveFile}
          canDelete={canDelete}
          canMove={canMove}
          isRoot
        />
        {files.length === 0 &&
          (showStarters && onNewFileFromStarter ? (
            <StarterGallery
              title={t("starter.title")}
              hint={t("starter.hint")}
              onSelect={(dsl) => {
                setShowStarters(false);
                onNewFileFromStarter(selectedDir, dsl);
              }}
              onSkip={() => {
                setShowStarters(false);
                onNewFile(selectedDir);
              }}
              skipLabel={t("starter.startBlank")}
            />
          ) : (
            <div className="sw-tree-empty">
              <p>{t("tree.noFiles")}</p>
              {canCreate && (
                <button
                  type="button"
                  className="sw-btn sw-btn-sm"
                  onClick={() =>
                    onNewFileFromStarter ? setShowStarters(true) : onNewFile(selectedDir)
                  }
                >
                  {t("tree.createFirst")}
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  activeId,
  dirtyIds,
  selectedDir,
  onSelectDir,
  onOpenFile,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  canDelete,
  canMove,
  isRoot,
}) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const dragCount = useRef(0);
  const pad = { paddingLeft: 8 + depth * 12 };

  function handleFolderDragOver(e) {
    if (!canMove) return;
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleFolderDragEnter(e) {
    if (!canMove) return;
    e.stopPropagation();
    e.preventDefault();
    dragCount.current++;
    setIsDropTarget(true);
  }

  function handleFolderDragLeave(e) {
    if (!canMove) return;
    e.stopPropagation();
    dragCount.current--;
    if (dragCount.current === 0) setIsDropTarget(false);
  }

  function handleFolderDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    dragCount.current = 0;
    setIsDropTarget(false);
    if (!canMove) return;
    const fromId = e.dataTransfer.getData("text/plain");
    if (!fromId) return;
    const fileName = fromId.split("/").pop();
    const toId = `${node.path}/${fileName}`;
    if (fromId !== toId) onMoveFile(fromId, toId);
  }

  return (
    <div>
      {!isRoot && (
        <div
          className={[
            "sw-tree-folder",
            selectedDir === node.path ? "sw-tree-selected" : "",
            isDropTarget ? "sw-tree-drag-over" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={pad}
          onClick={() => onSelectDir(node.path)}
          onDragOver={handleFolderDragOver}
          onDragEnter={handleFolderDragEnter}
          onDragLeave={handleFolderDragLeave}
          onDrop={handleFolderDrop}
        >
          <button
            type="button"
            className="sw-tree-twisty"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {open ? <FolderOpen size={13} /> : <Folder size={13} />}
          <span className="sw-tree-label">{node.name}</span>
          {canDelete && (
            <button
              type="button"
              className="sw-tree-item-del"
              title={t("tree.deleteFolder")}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFolder(node.path);
              }}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      )}
      {open && (
        <>
          {node.folders.map((folder) => (
            <TreeNode
              key={folder.path}
              node={folder}
              depth={isRoot ? 0 : depth + 1}
              activeId={activeId}
              dirtyIds={dirtyIds}
              selectedDir={selectedDir}
              onSelectDir={onSelectDir}
              onOpenFile={onOpenFile}
              onDeleteFile={onDeleteFile}
              onDeleteFolder={onDeleteFolder}
              onMoveFile={onMoveFile}
              canDelete={canDelete}
              canMove={canMove}
            />
          ))}
          {node.files.map((file) => (
            <div
              key={file.id}
              className={`sw-tree-file${activeId === file.id ? " sw-tree-active" : ""}`}
              style={{ paddingLeft: 8 + (isRoot ? 0 : depth + 1) * 12 + 14 }}
              onClick={() => onOpenFile(file.id)}
              title={file.id}
              draggable={canMove ? true : undefined}
              onDragStart={
                canMove
                  ? (e) => {
                      e.stopPropagation();
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", file.id);
                    }
                  : undefined
              }
            >
              <FileIcon size={13} />
              <span className="sw-tree-label">{file.name}</span>
              {dirtyIds?.has(file.id) && <span className="sw-dot" aria-label="unsaved" />}
              {canDelete && (
                <button
                  type="button"
                  className="sw-tree-item-del"
                  title={t("tree.deleteFile")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFile(file.id);
                  }}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
