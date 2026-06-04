import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
} from "lucide-react";
import { buildFolderTree } from "../lib/folder-tree.js";

/**
 * Nested folder tree built by splitting each FileRef.id on "/". Clicking a file
 * opens it; "New file"/"New folder" act under the selected folder.
 */
export function FolderTree({
  files,
  activeId,
  dirtyIds,
  selectedDir,
  onSelectDir,
  onOpenFile,
  onNewFile,
  onNewFolder,
  canCreate,
  canMkdir,
}) {
  const tree = useMemo(() => buildFolderTree(files), [files]);

  return (
    <div className="sw-tree">
      <div className="sw-tree-header">
        <span className="sw-tree-title">Files</span>
        <span className="sw-tree-actions">
          {canCreate && (
            <button
              type="button"
              className="sw-icon-btn"
              title="New file"
              onClick={() => onNewFile(selectedDir)}
            >
              <FilePlus size={14} />
            </button>
          )}
          {canMkdir && (
            <button
              type="button"
              className="sw-icon-btn"
              title="New folder"
              onClick={() => onNewFolder(selectedDir)}
            >
              <FolderPlus size={14} />
            </button>
          )}
        </span>
      </div>
      <div className="sw-tree-body">
        <TreeNode
          node={tree}
          depth={0}
          activeId={activeId}
          dirtyIds={dirtyIds}
          selectedDir={selectedDir}
          onSelectDir={onSelectDir}
          onOpenFile={onOpenFile}
          isRoot
        />
        {files.length === 0 && <div className="sw-tree-empty">No files</div>}
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
  isRoot,
}) {
  const [open, setOpen] = useState(true);
  const pad = { paddingLeft: 8 + depth * 12 };

  return (
    <div>
      {!isRoot && (
        <div
          className={`sw-tree-folder ${selectedDir === node.path ? "sw-tree-selected" : ""}`}
          style={pad}
          onClick={() => onSelectDir(node.path)}
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
            />
          ))}
          {node.files.map((file) => (
            <div
              key={file.id}
              className={`sw-tree-file ${activeId === file.id ? "sw-tree-active" : ""}`}
              style={{ paddingLeft: 8 + (isRoot ? 0 : depth + 1) * 12 + 14 }}
              onClick={() => onOpenFile(file.id)}
              title={file.id}
            >
              <FileIcon size={13} />
              <span className="sw-tree-label">{file.name}</span>
              {dirtyIds?.has(file.id) && <span className="sw-dot" aria-label="unsaved" />}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
