"use client";

/**
 * The file picker in the mobile editor's bottom sheet.
 *
 * `FileTree` is the desktop sidebar and is tuned for it: compact rows, no
 * search, no collapsing. A phone needs the opposite — touch-sized targets, a
 * way to cut a long list down, and a way to fold away folders you are not in —
 * so this is its own component rather than a variant flag on that one. Both
 * build their nesting from the same `buildFolderTree`.
 *
 * The flat list this replaced repeated the whole directory path above every
 * group, which on real repositories (`apps/samples/BF-AC-010-001/…`) left
 * almost no width for the file names themselves.
 */

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, FileText, Folder, Pencil, Search } from "lucide-react";
import { buildFolderTree, type FolderTreeNode } from "@swimlane-cloud/editor";
import { useT } from "@/i18n";

/** Below this a search box is more clutter than help. */
const SEARCH_THRESHOLD = 8;

export function MobileFilePicker({
  paths,
  active,
  onPick,
  onRename,
}: {
  paths: string[];
  active: string;
  onPick: (path: string) => void;
  /** Offered on the active file only — a phone has no hover to reveal it on the rest. */
  onRename?: (path: string) => void;
}) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  // Folders the reader has explicitly folded away. Everything starts open: in a
  // picker you want to see the files, and search covers the very large case.
  const [closed, setClosed] = useState<Set<string>>(() => new Set());

  const tree = useMemo(
    () => buildFolderTree(paths.map((p) => ({ id: p, name: p.split("/").pop() ?? p }))),
    [paths],
  );

  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () => (needle ? paths.filter((p) => p.toLowerCase().includes(needle)) : []),
    [needle, paths],
  );

  const toggle = (path: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  if (paths.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-400">{t("mobile.noFiles")}</p>;
  }

  return (
    <div className="-mt-1">
      {paths.length > SEARCH_THRESHOLD && (
        <div className="relative mb-2">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("mobile.searchFiles")}
            // Deliberately not autofocused: on a phone that opens the keyboard
            // over the list the reader came here to look at.
            className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
      )}

      {needle ? (
        matches.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-400">{t("mobile.noMatches")}</p>
        ) : (
          <ul className="space-y-0.5">
            {matches.map((p) => (
              <li key={p}>
                <FileRow
                  path={p}
                  name={p.split("/").pop() ?? p}
                  active={active}
                  onPick={onPick}
                  onRename={onRename}
                  showDir
                />
              </li>
            ))}
          </ul>
        )
      ) : (
        <Branch
          node={tree}
          depth={0}
          isRoot
          active={active}
          onPick={onPick}
          onRename={onRename}
          closed={closed}
          onToggle={toggle}
        />
      )}
    </div>
  );
}

function Branch({
  node,
  depth,
  isRoot,
  active,
  onPick,
  onRename,
  closed,
  onToggle,
}: {
  node: FolderTreeNode;
  depth: number;
  isRoot?: boolean;
  active: string;
  onPick: (path: string) => void;
  onRename?: (path: string) => void;
  closed: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isClosed = !isRoot && closed.has(node.path);
  const indent = depth * 14;

  return (
    <div>
      {!isRoot && (
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          style={{ paddingLeft: indent }}
          className="flex w-full items-center gap-1.5 rounded-md py-2 pr-2 text-left text-sm text-neutral-500 hover:bg-neutral-50"
        >
          {isClosed ? (
            <ChevronRight size={14} className="shrink-0 text-neutral-400" />
          ) : (
            <ChevronDown size={14} className="shrink-0 text-neutral-400" />
          )}
          <Folder size={15} className="shrink-0 text-neutral-400" />
          <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
          <span className="shrink-0 text-xs text-neutral-400">{countFiles(node)}</span>
        </button>
      )}
      {!isClosed && (
        <>
          {node.folders.map((f) => (
            <Branch
              key={f.path}
              node={f}
              depth={isRoot ? 0 : depth + 1}
              active={active}
              onPick={onPick}
              onRename={onRename}
              closed={closed}
              onToggle={onToggle}
            />
          ))}
          {node.files.map((f) => (
            <FileRow
              key={f.id}
              path={f.id}
              name={f.name}
              active={active}
              onPick={onPick}
              onRename={onRename}
              indent={isRoot ? 0 : indent + 14}
            />
          ))}
        </>
      )}
    </div>
  );
}

function FileRow({
  path,
  name,
  active,
  onPick,
  onRename,
  indent = 0,
  showDir = false,
}: {
  path: string;
  name: string;
  active: string;
  onPick: (path: string) => void;
  onRename?: (path: string) => void;
  indent?: number;
  /** Search results are flat, so the name alone does not say which file it is. */
  showDir?: boolean;
}) {
  const { t } = useT();
  const isActive = path === active;
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => onPick(path)}
        style={{ paddingLeft: indent + 8 }}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-md py-2.5 pr-2 text-left ${
          isActive ? "bg-indigo-50 text-indigo-700" : "hover:bg-neutral-50"
        }`}
      >
        <FileText size={15} className={`shrink-0 ${isActive ? "" : "text-neutral-400"}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-sm">{name}</span>
          {showDir && dir && (
            <span
              className={`block truncate text-xs ${isActive ? "text-indigo-400" : "text-neutral-400"}`}
            >
              {dir}/
            </span>
          )}
        </span>
        {isActive && <Check size={16} className="shrink-0 text-indigo-600" />}
      </button>
      {isActive && onRename && (
        <button
          type="button"
          onClick={() => onRename(path)}
          aria-label={t("mobile.renameFile")}
          title={t("mobile.renameFile")}
          className="ml-1 shrink-0 rounded-md p-2.5 text-indigo-600 hover:bg-indigo-50"
        >
          <Pencil size={16} />
        </button>
      )}
    </div>
  );
}

function countFiles(node: FolderTreeNode): number {
  return node.files.length + node.folders.reduce((n, f) => n + countFiles(f), 0);
}
