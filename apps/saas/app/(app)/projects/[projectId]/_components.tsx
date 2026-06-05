"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Plus,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { textToSvg, renderPartsPreviewHtml } from "@swimlane-cloud/diagram-converter";
import { THEMES } from "@swimlane-cloud/diagram-converter/themes";
import {
  parseGuiModel,
  applyModelEdit,
  extractPartsCode,
  findAdjacentStepIndex,
  moveRow,
} from "@swimlane-cloud/editor";
import { MobileDiagram } from "@swimlane-cloud/mobile-view";
import "@swimlane-cloud/mobile-view/styles.css";
import {
  loadState,
  setRole as setRoleAction,
  resetDemo,
  tipFiles,
  primaryPath,
  type Files,
  type WorkflowState,
  type Role,
} from "@/lib/demo-workflow";
import { demoProjectName } from "@/lib/demo";

/**
 * Shared project state hook: loads the localStorage workflow state, exposes the
 * role switch + reset, and the project name. Each split page uses this.
 */
export function useProject() {
  const params = useParams();
  const projectId = String(params.projectId);
  const [st, setSt] = useState<WorkflowState | null>(null);
  useEffect(() => {
    setSt(loadState(projectId));
  }, [projectId]);

  const setRole = (r: Role) => {
    if (st) setSt(setRoleAction(projectId, st, r));
  };
  const reset = () => {
    if (typeof window !== "undefined" && !window.confirm("Reset this demo project?")) return;
    resetDemo(projectId);
    setSt(loadState(projectId));
  };

  return {
    projectId,
    projectName: demoProjectName(projectId),
    st,
    setSt,
    setRole,
    reset,
  };
}

/**
 * Shared client UI for the split project pages (Edit / Branches / Pull Requests
 * / Versions): the top nav with role switch, plus the History / PR / Version
 * panels and small atoms.
 */

const TABS = [
  { key: "edit", label: "Edit", href: "edit" },
  { key: "branches", label: "Branches", href: "branches" },
  { key: "pulls", label: "Pull Requests", href: "pulls" },
  { key: "versions", label: "Versions", href: "versions" },
] as const;

export function ProjectNav({
  projectId,
  projectName,
  active,
  role,
  onRole,
  onReset,
}: {
  projectId: string;
  projectName: string;
  active: string;
  role: Role;
  onRole: (r: Role) => void;
  onReset: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-neutral-200">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-base font-semibold">{projectName}</h1>
        </div>
        <div className="flex items-center gap-4">
          <RoleSwitch role={role} onChange={onRole} />
          <button onClick={onReset} className="text-xs text-neutral-400 hover:text-neutral-600">
            Reset demo
          </button>
        </div>
      </div>
      <nav className="flex gap-1 px-3">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/projects/${projectId}/${t.href}`}
            className={`border-b-2 px-3 py-2 text-sm ${
              active === t.key
                ? "border-indigo-600 font-medium text-indigo-600"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function RoleSwitch({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-neutral-300 p-0.5 text-xs">
      {(["member", "manager"] as Role[]).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`rounded px-2 py-1 ${
            role === r ? "bg-indigo-600 text-white" : "text-neutral-600"
          }`}
        >
          {r === "manager" ? "Manager" : "Member"}
        </button>
      ))}
    </div>
  );
}

export function Action({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-sm hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-400"
    >
      {children}
    </button>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">
      {children}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-6 text-center text-sm text-neutral-400">{children}</p>;
}

/**
 * Shared modal / bottom-sheet: one backdrop + panel used by every popup
 * (preview, step edit, pickers) so they look and behave consistently. Bottom
 * sheet on phones, centered card on wider screens.
 */
export function Modal({
  title,
  onClose,
  footer,
  maxW = "max-w-md",
  z = "z-50",
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  maxW?: string;
  z?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`fixed inset-0 ${z} flex items-end justify-center bg-black/40 sm:items-center`}
      onClick={onClose}
    >
      <div
        className={`flex max-h-[90vh] w-full ${maxW} flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
        {footer && <div className="border-t border-neutral-200 p-4">{footer}</div>}
      </div>
    </div>
  );
}

export function HistoryPanel({ st, branch }: { st: WorkflowState; branch: string }) {
  const commits = [...(st.branches[branch]?.commits ?? [])].reverse();
  const [preview, setPreview] = useState<{ title: string; files: Files } | null>(null);
  if (commits.length === 0) return <Empty>No commits on this branch.</Empty>;
  return (
    <>
      <ol className="space-y-2">
        {commits.map((c, i) => (
          <li key={c.id} className="rounded-md border border-neutral-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{c.message}</div>
                <div className="text-xs text-neutral-500">
                  {c.author} · {new Date(c.ts).toLocaleString()}
                  {i === 0 && (
                    <span className="ml-2 rounded bg-green-100 px-1 text-green-700">tip</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setPreview({ title: c.message, files: c.files })}
                className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-xs hover:border-indigo-400 hover:text-indigo-600"
              >
                Preview
              </button>
            </div>
          </li>
        ))}
      </ol>
      {preview && (
        <PreviewModal
          title={preview.title}
          files={preview.files}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

/** On-device diagram preview (renders DSL→SVG in the browser with the engine). */
export function PreviewModal({
  title,
  files,
  onClose,
}: {
  title: string;
  files: Files;
  onClose: () => void;
}) {
  const paths = Object.keys(files).filter((p) => p.endsWith(".txt")).sort();
  const [path, setPath] = useState(primaryPath(files) ?? paths[0] ?? "");
  const svg = useMemo(() => {
    const src = files[path];
    if (!src) return null;
    try {
      return textToSvg(src, { themeKey: "basic" }).svg;
    } catch {
      return null;
    }
  }, [files, path]);

  return (
    <Modal title={title} onClose={onClose} maxW="max-w-3xl">
      {paths.length > 1 && (
        <div className="mb-3 flex gap-1">
          {paths.map((p) => (
            <button
              key={p}
              onClick={() => setPath(p)}
              className={`rounded px-2 py-1 font-mono text-xs ${
                p === path ? "bg-indigo-600 text-white" : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      {svg ? (
        <div
          className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <Empty>Could not render this commit (parse error or empty).</Empty>
      )}
    </Modal>
  );
}

export function PrPanel({
  st,
  isManager,
  reviewPR,
  onReview,
  onMerge,
  onClose,
  onComment,
}: {
  st: WorkflowState;
  isManager: boolean;
  reviewPR: string | null;
  onReview: (id: string) => void;
  onMerge: (id: string) => void;
  onClose: (id: string) => void;
  onComment: (id: string, text: string) => void;
}) {
  if (st.prs.length === 0)
    return (
      <Empty>
        No pull requests yet. On the Edit page, open a PR from a tmp-* branch
        (→ test) or from test (→ main).
      </Empty>
    );
  return (
    <ul className="space-y-3">
      {st.prs.map((pr) => {
        const headFiles = tipFiles(st.branches[pr.head]);
        const baseFiles = tipFiles(st.branches[pr.base]);
        const changed = Object.keys({ ...headFiles, ...baseFiles }).filter(
          (p) => (headFiles[p] ?? "") !== (baseFiles[p] ?? ""),
        );
        const canClose = pr.status === "open" && (isManager || st.role === pr.author);
        const badge =
          pr.status === "merged"
            ? "bg-purple-100 text-purple-700"
            : pr.status === "closed"
              ? "bg-neutral-200 text-neutral-600"
              : "bg-amber-100 text-amber-700";
        return (
          <li key={pr.id} className="rounded-md border border-neutral-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{pr.title}</div>
                <div className="text-xs text-neutral-500">
                  {pr.head} → {pr.base} · opened by {pr.author}
                </div>
              </div>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${badge}`}>{pr.status}</span>
            </div>

            {pr.status === "open" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => onReview(pr.id)}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  {reviewPR === pr.id
                    ? "Hide diff"
                    : `Review (${changed.length} file${changed.length === 1 ? "" : "s"})`}
                </button>
                <div className="ml-auto flex items-center gap-2">
                  {canClose && (
                    <button
                      onClick={() => onClose(pr.id)}
                      className="rounded border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
                    >
                      Close
                    </button>
                  )}
                  {isManager ? (
                    <button
                      onClick={() => onMerge(pr.id)}
                      className="rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-500"
                    >
                      Merge → {pr.base}
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-400">Manager merges</span>
                  )}
                </div>
              </div>
            )}

            {reviewPR === pr.id && (
              <div className="mt-3 space-y-2">
                {changed.length === 0 && <Empty>No differences.</Empty>}
                {changed.map((p) => (
                  <Diff key={p} path={p} before={baseFiles[p] ?? ""} after={headFiles[p] ?? ""} />
                ))}
              </div>
            )}

            <PrComments pr={pr} role={st.role} onComment={onComment} />
          </li>
        );
      })}
    </ul>
  );
}

function PrComments({
  pr,
  role,
  onComment,
}: {
  pr: WorkflowState["prs"][number];
  role: string;
  onComment: (id: string, text: string) => void;
}) {
  const [text, setText] = useState("");
  const comments = pr.comments ?? [];
  return (
    <div className="mt-3 border-t border-neutral-100 pt-2">
      {comments.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {comments.map((c, i) => (
            <li key={i} className="rounded-md bg-neutral-50 px-2 py-1.5 text-sm">
              <span className="mr-2 text-xs font-medium text-neutral-500">{c.author}</span>
              {c.text}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              onComment(pr.id, text);
              setText("");
            }
          }}
          placeholder={`Comment as ${role}…`}
          className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
        />
        <button
          onClick={() => {
            if (text.trim()) {
              onComment(pr.id, text);
              setText("");
            }
          }}
          disabled={!text.trim()}
          className="rounded-md bg-neutral-800 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          Comment
        </button>
      </div>
    </div>
  );
}

function Diff({ path, before, after }: { path: string; before: string; after: string }) {
  const a = before.split("\n");
  const b = after.split("\n");
  const max = Math.max(a.length, b.length);
  const rows = Array.from({ length: max }, (_, i) => {
    const l = a[i] ?? "";
    const r = b[i] ?? "";
    return { l, r, changed: l !== r };
  });
  return (
    <div className="rounded border border-neutral-200">
      <div className="border-b border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-xs">
        {path}
      </div>
      <div className="grid grid-cols-2 font-mono text-[11px] leading-relaxed">
        <pre className="overflow-auto border-r border-neutral-200 p-1">
          {rows.map((row, i) => (
            <div key={i} className={row.changed ? "bg-red-50" : ""}>
              {row.l || " "}
            </div>
          ))}
        </pre>
        <pre className="overflow-auto p-1">
          {rows.map((row, i) => (
            <div key={i} className={row.changed ? "bg-green-50" : ""}>
              {row.r || " "}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

export function VersionPanel({
  st,
  isManager,
  onPromote,
  onPublish,
  onUnpublish,
}: {
  st: WorkflowState;
  isManager: boolean;
  onPromote: (id: string) => void;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
}) {
  if (st.versions.length === 0)
    return <Empty>No versions yet. A Manager flags one from the test branch above.</Empty>;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {st.versions.map((v) => (
        <li key={v.id} className="rounded-md border border-neutral-200 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium">{v.name}</div>
              {v.note && <div className="truncate text-xs text-neutral-500">{v.note}</div>}
              <div className="text-xs text-neutral-400">{new Date(v.ts).toLocaleString()}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {!v.promoted ? (
                isManager ? (
                  <button
                    onClick={() => onPromote(v.id)}
                    className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                  >
                    Promote → main
                  </button>
                ) : (
                  <span className="text-xs text-neutral-400">Manager promotes</span>
                )
              ) : (
                <>
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                    on main
                  </span>
                  {v.published ? (
                    <>
                      <a
                        href={`/p/${v.publicSlug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-indigo-600 underline"
                      >
                        /p/{v.publicSlug}
                      </a>
                      {isManager && (
                        <button
                          onClick={() => onUnpublish(v.id)}
                          className="text-xs text-neutral-400 hover:text-neutral-600"
                        >
                          Unpublish
                        </button>
                      )}
                    </>
                  ) : isManager ? (
                    <button
                      onClick={() => onPublish(v.id)}
                      className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                    >
                      Publish
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-400">not published</span>
                  )}
                </>
              )}
            </div>
          </div>
          {v.svg && (
            <div
              className="mt-2 max-h-48 overflow-auto rounded border border-neutral-100 bg-white p-1 [&_svg]:h-auto [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: v.svg }}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function nthStepRowIndex(rows: { kind: string; empty?: boolean }[], n: number): number {
  let c = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind === "step" && !rows[i].empty) {
      if (c === n) return i;
      c++;
    }
  }
  return -1;
}

/** Mobile render of the active branch's files; editable per-step when allowed. */
export function MobileView({
  files,
  editable = false,
  onSave,
  path: pathProp,
  onPath,
  editStep: editStepProp,
  onEditStep,
}: {
  files: Files;
  editable?: boolean;
  onSave?: (path: string, dsl: string) => void;
  path?: string;
  onPath?: (p: string) => void;
  editStep?: number | null;
  onEditStep?: (i: number | null) => void;
}) {
  const paths = Object.keys(files).filter((p) => p.endsWith(".txt")).sort();
  const [pathState, setPathState] = useState(primaryPath(files) ?? paths[0] ?? "");
  const path = pathProp ?? pathState;
  const setPath = (p: string) => (onPath ? onPath(p) : setPathState(p));
  const active = files[path] !== undefined ? path : paths[0] ?? "";
  const [dsl, setDsl] = useState(files[active] ?? "");
  const [stepState, setStepState] = useState<number | null>(null);
  const editStep = editStepProp !== undefined ? editStepProp : stepState;
  const setEditStep = (i: number | null) => (onEditStep ? onEditStep(i) : setStepState(i));
  const [showFiles, setShowFiles] = useState(false);
  const activeDir = active.includes("/") ? active.slice(0, active.lastIndexOf("/")) : "";

  useEffect(() => {
    setDsl(files[active] ?? "");
  }, [active, files]);

  const gui = useMemo(() => parseGuiModel(dsl), [dsl]);
  const editing =
    editStep != null
      ? (() => {
          const i = nthStepRowIndex(gui.rows, editStep);
          return i >= 0 ? gui.rows[i] : null;
        })()
      : null;

  const applyPatch = (patch: Record<string, unknown>) => {
    if (editStep == null) return;
    const next = applyModelEdit(dsl, (draft) => {
      const i = nthStepRowIndex(draft.rows, editStep);
      if (i >= 0) draft.rows[i] = { ...draft.rows[i], ...patch };
    });
    setDsl(next);
    onSave?.(active, next);
    setEditStep(null);
  };

  const addStep = () => {
    const next = applyModelEdit(dsl, (draft) => {
      draft.rows.push({
        kind: "step",
        role: gui.lanes[0]?.id ?? "",
        text: "New step",
      });
    });
    setDsl(next);
    onSave?.(active, next);
  };

  const deleteStep = () => {
    if (editStep == null) return;
    const next = applyModelEdit(dsl, (draft) => {
      const i = nthStepRowIndex(draft.rows, editStep);
      if (i >= 0) draft.rows.splice(i, 1);
    });
    setDsl(next);
    onSave?.(active, next);
    setEditStep(null);
  };

  const editRowIndex = editStep != null ? nthStepRowIndex(gui.rows, editStep) : -1;
  const canMoveUp = editRowIndex >= 0 && findAdjacentStepIndex(gui.rows, editRowIndex, "up") >= 0;
  const canMoveDown = editRowIndex >= 0 && findAdjacentStepIndex(gui.rows, editRowIndex, "down") >= 0;
  const moveStep = (dir: "up" | "down") => {
    if (editStep == null) return;
    const next = applyModelEdit(dsl, (draft) => {
      const i = nthStepRowIndex(draft.rows, editStep);
      const adj = findAdjacentStepIndex(draft.rows, i, dir);
      if (i >= 0 && adj >= 0) draft.rows = moveRow(draft.rows, i, adj).rows;
    });
    setDsl(next);
    onSave?.(active, next);
    setEditStep(dir === "up" ? Math.max(0, editStep - 1) : editStep + 1);
  };

  return (
    <div className="flex h-full flex-col bg-neutral-100">
      {paths.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2">
          <button
            onClick={() => setShowFiles(true)}
            className="flex items-center gap-2 rounded-md border border-neutral-300 px-2.5 py-1 hover:border-indigo-400"
          >
            <FolderOpen size={15} className="text-neutral-500" />
            <span className="font-mono text-xs">{active.split("/").pop() || "—"}</span>
            <ChevronDown size={14} className="text-neutral-400" />
          </button>
          {activeDir && <span className="truncate text-xs text-neutral-400">{activeDir}/</span>}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <MobileDiagram
          dsl={dsl}
          editable={editable}
          onEditStep={editable ? (i) => setEditStep(i) : undefined}
        />
        {editable && (
          <div className="px-3 pb-6">
            <button
              onClick={addStep}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 py-2.5 text-sm text-neutral-600 hover:border-indigo-400 hover:text-indigo-600"
            >
              <Plus size={16} /> Add step
            </button>
          </div>
        )}
      </div>
      {editing && (
        <StepEditModal
          row={editing}
          dsl={dsl}
          lanes={gui.lanes}
          blocks={gui.blocks}
          props={gui.props}
          onSave={applyPatch}
          onClose={() => setEditStep(null)}
          onDelete={deleteStep}
          onMove={moveStep}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
        />
      )}
      {showFiles && (
        <Modal title="Files" onClose={() => setShowFiles(false)}>
          <FileList
            paths={paths}
            active={active}
            onPick={(p) => {
              setPath(p);
              setShowFiles(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function FileList({
  paths,
  active,
  onPick,
}: {
  paths: string[];
  active: string;
  onPick: (p: string) => void;
}) {
  const groups: Record<string, string[]> = {};
  for (const p of paths) {
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    (groups[dir] ||= []).push(p);
  }
  const dirs = Object.keys(groups).sort();
  if (paths.length === 0) return <Empty>No files.</Empty>;
  return (
    <div className="space-y-4">
      {dirs.map((dir) => (
        <div key={dir || "root"}>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-400">
            <FolderOpen size={13} /> {dir || "/"}
          </div>
          <ul className="space-y-1">
            {groups[dir].map((p) => (
              <li key={p}>
                <button
                  onClick={() => onPick(p)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left ${
                    p === active ? "bg-indigo-50 text-indigo-700" : "hover:bg-neutral-100"
                  }`}
                >
                  <span className="truncate font-mono text-sm">{p.split("/").pop()}</span>
                  {p === active && <Check size={15} className="shrink-0 text-indigo-600" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const ARROWS = ["solid", "dashed", "none"];

function StepEditModal({
  row,
  dsl,
  lanes,
  blocks,
  props,
  onSave,
  onClose,
  onDelete,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  row: Record<string, unknown>;
  dsl: string;
  lanes: Array<{ id: string; label?: string }>;
  blocks: Record<string, { id: string; label?: string }>;
  props: Record<string, { id: string; label?: string }>;
  onSave: (patch: Record<string, unknown>) => void;
  onClose: () => void;
  onDelete?: () => void;
  onMove?: (dir: "up" | "down") => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const [role, setRole] = useState(String(row.role ?? ""));
  const [text, setText] = useState(String(row.text ?? ""));
  const [description, setDescription] = useState(String(row.description ?? ""));
  const [remark, setRemark] = useState(String(row.remark ?? ""));
  const [arrowLine, setArrowLine] = useState(String(row.arrowLine ?? "solid"));
  const [blockRef, setBlockRef] = useState(String(row.blockRef ?? ""));
  const [sel, setSel] = useState<Set<string>>(
    new Set(Array.isArray(row.props) ? (row.props as string[]) : []),
  );
  const propList = Object.values(props);

  const footer = (
    <div className="flex items-center gap-2">
      {onDelete && (
        <button
          onClick={onDelete}
          title="Delete step"
          className="rounded-lg border border-red-200 px-3 py-2 text-red-600 hover:bg-red-50"
        >
          <Trash2 size={16} />
        </button>
      )}
      <button onClick={onClose} className="flex-1 rounded-lg border border-neutral-300 py-2 text-sm">
        Cancel
      </button>
      <button
        onClick={() =>
          onSave({
            role: role || null,
            text,
            description,
            remark,
            arrowLine,
            blockRef: blockRef || null,
            props: [...sel],
          })
        }
        className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Save
      </button>
    </div>
  );

  return (
    <Modal title="Edit step" onClose={onClose} z="z-[60]" footer={footer}>
      <div className="space-y-3">
        {onMove && (
          <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
            <span className="text-xs font-medium text-neutral-500">Move position</span>
            <div className="flex gap-2">
              <button
                onClick={() => onMove("up")}
                disabled={!canMoveUp}
                title="Move up"
                className="rounded-md border border-neutral-300 bg-white p-1.5 text-neutral-600 hover:border-indigo-400 disabled:opacity-40"
              >
                <ArrowUp size={16} />
              </button>
              <button
                onClick={() => onMove("down")}
                disabled={!canMoveDown}
                title="Move down"
                className="rounded-md border border-neutral-300 bg-white p-1.5 text-neutral-600 hover:border-indigo-400 disabled:opacity-40"
              >
                <ArrowDown size={16} />
              </button>
            </div>
          </div>
        )}
        <Field label="Role (lane)">
            <select value={role} onChange={(e) => setRole(e.target.value)} className="sw-mf">
              {!role && <option value="">(choose a role)</option>}
              {lanes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label || l.id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Text">
            <input value={text} onChange={(e) => setText(e.target.value)} className="sw-mf" />
          </Field>
          <Field label="Description">
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="sw-mf"
            />
          </Field>
          <Field label="Remark">
            <textarea
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="sw-mf"
            />
          </Field>
          <Field label="Block style">
            <BlockPicker value={blockRef} blocks={blocks} dsl={dsl} onChange={setBlockRef} />
          </Field>
          <Field label="Arrow">
            <ArrowPicker value={arrowLine} onChange={setArrowLine} />
          </Field>
          {propList.length > 0 && (
            <Field label="Props">
              <PropsPicker value={sel} props={props} dsl={dsl} onChange={setSel} />
            </Field>
          )}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

/** "Switch to mobile view?" prompt shown when opening the editor on a phone. */
export function MobilePrompt({
  onMobile,
  onStay,
}: {
  onMobile: () => void;
  onStay: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Small screen detected</h2>
        <p className="mt-1 text-sm text-neutral-600">
          The full editor is built for wide screens. Switch to a mobile-friendly,
          read-only view of this diagram?
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={onMobile}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <Smartphone size={16} /> Switch to mobile view
          </button>
          <button
            onClick={onStay}
            className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600"
          >
            Stay in the editor
          </button>
        </div>
      </div>
    </div>
  );
}

/** True on a phone-sized / touch screen. */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(max-width: 768px)").matches || window.innerWidth <= 768;
}

/* ---- mobile preview-popup pickers (block / arrow / props) ---- */

function PartsPreview({
  dsl,
  section,
  id,
  compact = false,
}: {
  dsl: string;
  section: "block" | "prop";
  id: string;
  compact?: boolean;
}) {
  const html = useMemo(() => {
    try {
      const code = extractPartsCode(dsl, section, id);
      if (!code) return "";
      return renderPartsPreviewHtml(code, THEMES.basic);
    } catch {
      return "";
    }
  }, [dsl, section, id]);
  if (!html) return null;
  // Let the SVG scale to fit its box (aspect preserved) instead of being clipped.
  const cls = compact
    ? "[&_svg]:h-7 [&_svg]:w-auto [&_svg]:max-w-[140px]"
    : "flex w-full items-center justify-center [&_svg]:h-auto [&_svg]:max-h-32 [&_svg]:max-w-full";
  return <div className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
}

function ArrowPreview({ kind }: { kind: string }) {
  if (kind === "none") return <span className="text-xs text-neutral-400">no connector</span>;
  return (
    <svg width="96" height="14" viewBox="0 0 96 14" aria-hidden>
      <line
        x1="2"
        y1="7"
        x2="84"
        y2="7"
        stroke="#475569"
        strokeWidth="2"
        strokeDasharray={kind === "dashed" ? "7 5" : undefined}
      />
      <path d="M84 7 L76 3 L76 11 Z" fill="#475569" />
    </svg>
  );
}

function PickerTrigger({
  label,
  preview,
  onClick,
}: {
  label: string;
  preview?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-left text-sm hover:border-indigo-400"
    >
      {preview && <span className="shrink-0">{preview}</span>}
      <span className="flex-1 truncate">{label}</span>
      <ChevronRight size={16} className="text-neutral-400" />
    </button>
  );
}

function PickerSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal title={title} onClose={onClose} z="z-[70]">
      <div className="space-y-2">{children}</div>
    </Modal>
  );
}

function PickerTile({
  selected,
  label,
  preview,
  onClick,
}: {
  selected: boolean;
  label: string;
  preview?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-2 text-left text-sm ${
        selected ? "border-indigo-600 bg-indigo-50" : "border-neutral-200"
      }`}
    >
      <div className="flex min-h-[72px] items-center justify-center rounded bg-neutral-50 p-2">
        {preview ?? <span className="text-xs text-neutral-400">—</span>}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="truncate">{label}</span>
        {selected && <Check size={16} className="shrink-0 text-indigo-600" />}
      </div>
    </button>
  );
}

function BlockPicker({
  value,
  blocks,
  dsl,
  onChange,
}: {
  value: string;
  blocks: Record<string, { id: string; label?: string }>;
  dsl: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = value ? blocks[value]?.label || value : "(none)";
  const opts = [
    { id: "", label: "(none)" },
    ...Object.values(blocks).map((b) => ({ id: b.id, label: b.label || b.id })),
  ];
  return (
    <>
      <PickerTrigger
        label={current}
        preview={value ? <PartsPreview dsl={dsl} section="block" id={value} compact /> : undefined}
        onClick={() => setOpen(true)}
      />
      {open && (
        <PickerSheet title="Block style" onClose={() => setOpen(false)}>
          {opts.map((o) => (
            <PickerTile
              key={o.id || "none"}
              selected={o.id === value}
              label={o.label}
              preview={o.id ? <PartsPreview dsl={dsl} section="block" id={o.id} /> : undefined}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            />
          ))}
        </PickerSheet>
      )}
    </>
  );
}

function ArrowPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PickerTrigger label={value} preview={<ArrowPreview kind={value} />} onClick={() => setOpen(true)} />
      {open && (
        <PickerSheet title="Arrow" onClose={() => setOpen(false)}>
          {ARROWS.map((a) => (
            <PickerTile
              key={a}
              selected={a === value}
              label={a}
              preview={<ArrowPreview kind={a} />}
              onClick={() => {
                onChange(a);
                setOpen(false);
              }}
            />
          ))}
        </PickerSheet>
      )}
    </>
  );
}

function PropsPicker({
  value,
  props,
  dsl,
  onChange,
}: {
  value: Set<string>;
  props: Record<string, { id: string; label?: string }>;
  dsl: string;
  onChange: (v: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = Object.values(props);
  const count = value.size;
  return (
    <>
      <PickerTrigger
        label={count ? `${count} selected` : "(none)"}
        onClick={() => setOpen(true)}
      />
      {open && (
        <PickerSheet title="Props" onClose={() => setOpen(false)}>
          {list.map((p) => (
            <PickerTile
              key={p.id}
              selected={value.has(p.id)}
              label={p.label || p.id}
              preview={<PartsPreview dsl={dsl} section="prop" id={p.id} />}
              onClick={() => {
                const n = new Set(value);
                if (n.has(p.id)) n.delete(p.id);
                else n.add(p.id);
                onChange(n);
              }}
            />
          ))}
        </PickerSheet>
      )}
    </>
  );
}
