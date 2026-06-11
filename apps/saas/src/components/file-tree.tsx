"use client";

import { FileText, Folder } from "lucide-react";
import { buildFolderTree, type FolderTreeNode } from "@swimlane-cloud/editor";

/**
 * Editor-style nested folder/file sidebar. Built from POSIX path ids via the
 * editor's buildFolderTree, so the commit preview, PR review, and public share
 * page all show the same tree. `statusOf` optionally colors files by edit state.
 */
export function FileTree({
  paths,
  active,
  onPick,
  statusOf,
  titleOf,
}: {
  paths: string[];
  active: string;
  onPick: (id: string) => void;
  statusOf?: (id: string) => "added" | "removed" | "changed" | "same";
  titleOf?: (id: string) => string | undefined;
}) {
  const tree = buildFolderTree(paths.map((p) => ({ id: p, name: p.split("/").pop() ?? p })));
  return (
    <div className="text-sm">
      <TreeNode node={tree} depth={0} active={active} onPick={onPick} statusOf={statusOf} titleOf={titleOf} isRoot />
    </div>
  );
}

function TreeNode({
  node,
  depth,
  active,
  onPick,
  statusOf,
  titleOf,
  isRoot,
}: {
  node: FolderTreeNode;
  depth: number;
  active: string;
  onPick: (id: string) => void;
  statusOf?: (id: string) => "added" | "removed" | "changed" | "same";
  titleOf?: (id: string) => string | undefined;
  isRoot?: boolean;
}) {
  return (
    <div>
      {!isRoot && (
        <div
          className="flex items-center gap-1.5 py-1 text-neutral-500"
          style={{ paddingLeft: depth * 12 }}
        >
          <Folder size={14} className="shrink-0 text-neutral-400" />
          <span className="truncate">{node.name}</span>
        </div>
      )}
      {node.folders.map((f) => (
        <TreeNode
          key={f.path}
          node={f}
          depth={isRoot ? 0 : depth + 1}
          active={active}
          onPick={onPick}
          statusOf={statusOf}
          titleOf={titleOf}
        />
      ))}
      {node.files.map((f) => {
        const status = statusOf?.(f.id);
        const color =
          status === "added"
            ? "text-green-700"
            : status === "removed"
              ? "text-red-700 line-through"
              : status === "changed"
                ? "text-amber-700"
                : "text-neutral-700";
        const isActive = f.id === active;
        const title = titleOf?.(f.id);
        return (
          <button
            key={f.id}
            onClick={() => onPick(f.id)}
            style={{ paddingLeft: (isRoot ? 0 : depth + 1) * 12 + 16 }}
            className={`flex w-full items-start gap-1.5 rounded py-1 pr-2 text-left ${
              isActive ? "bg-indigo-50 font-medium text-indigo-700" : `hover:bg-neutral-100 ${color}`
            }`}
          >
            <FileText size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1 overflow-hidden">
              <span className="block truncate">{title || f.name}</span>
              {title && (
                <span className={`block truncate text-xs font-normal ${
                  isActive ? "text-indigo-400" : "text-neutral-400"
                }`}>
                  {f.name}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
