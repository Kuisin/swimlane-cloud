"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { textToSvg } from "@swimlane-cloud/diagram-converter";
import { parseGuiModel, applyModelEdit } from "@swimlane-cloud/editor";
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
      className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-sm hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-400"
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{title}</div>
            <div className="text-xs text-neutral-400">Rendered on device</div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>
        {paths.length > 1 && (
          <div className="flex gap-1 border-b border-neutral-200 px-3 py-2">
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
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {svg ? (
            <div
              className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <Empty>Could not render this commit (parse error or empty).</Empty>
          )}
        </div>
      </div>
    </div>
  );
}

export function PrPanel({
  st,
  isManager,
  reviewPR,
  onReview,
  onMerge,
}: {
  st: WorkflowState;
  isManager: boolean;
  reviewPR: string | null;
  onReview: (id: string) => void;
  onMerge: (id: string) => void;
}) {
  if (st.prs.length === 0)
    return (
      <Empty>
        No pull requests yet. On the Edit page, start an edit branch and click
        “Open pull request”.
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
        return (
          <li key={pr.id} className="rounded-md border border-neutral-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{pr.title}</div>
                <div className="text-xs text-neutral-500">
                  {pr.head} → {pr.base} · opened by {pr.author}
                </div>
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                  pr.status === "merged"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {pr.status}
              </span>
            </div>
            {pr.status === "open" && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => onReview(pr.id)}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  {reviewPR === pr.id
                    ? "Hide diff"
                    : `Review (${changed.length} file${changed.length === 1 ? "" : "s"})`}
                </button>
                <div className="ml-auto">
                  {isManager ? (
                    <button
                      onClick={() => onMerge(pr.id)}
                      className="rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-500"
                    >
                      Merge to test
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-400">
                      Switch to Manager to merge
                    </span>
                  )}
                </div>
              </div>
            )}
            {reviewPR === pr.id && (
              <div className="mt-3 space-y-2">
                {changed.length === 0 && <Empty>No differences.</Empty>}
                {changed.map((p) => (
                  <Diff
                    key={p}
                    path={p}
                    before={baseFiles[p] ?? ""}
                    after={headFiles[p] ?? ""}
                  />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
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
}: {
  files: Files;
  editable?: boolean;
  onSave?: (path: string, dsl: string) => void;
}) {
  const paths = Object.keys(files).filter((p) => p.endsWith(".txt")).sort();
  const [path, setPath] = useState(primaryPath(files) ?? paths[0] ?? "");
  const active = files[path] !== undefined ? path : paths[0] ?? "";
  const [dsl, setDsl] = useState(files[active] ?? "");
  const [editStep, setEditStep] = useState<number | null>(null);

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

  return (
    <div className="flex h-full flex-col bg-neutral-100">
      {paths.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-auto border-b border-neutral-200 bg-white px-3 py-2">
          {paths.map((p) => (
            <button
              key={p}
              onClick={() => setPath(p)}
              className={`whitespace-nowrap rounded px-2 py-1 font-mono text-xs ${
                p === active ? "bg-indigo-600 text-white" : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {p.split("/").pop()}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <MobileDiagram
          dsl={dsl}
          editable={editable}
          onEditStep={editable ? (i) => setEditStep(i) : undefined}
        />
      </div>
      {editing && (
        <StepEditModal
          row={editing}
          lanes={gui.lanes}
          blocks={gui.blocks}
          props={gui.props}
          onSave={applyPatch}
          onClose={() => setEditStep(null)}
        />
      )}
    </div>
  );
}

const ARROWS = ["solid", "dashed", "none"];

function StepEditModal({
  row,
  lanes,
  blocks,
  props,
  onSave,
  onClose,
}: {
  row: Record<string, unknown>;
  lanes: Array<{ id: string; label?: string }>;
  blocks: Record<string, { id: string; label?: string }>;
  props: Record<string, { id: string; label?: string }>;
  onSave: (patch: Record<string, unknown>) => void;
  onClose: () => void;
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

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="text-base font-semibold">Edit step</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Block style">
              <select value={blockRef} onChange={(e) => setBlockRef(e.target.value)} className="sw-mf">
                <option value="">(none)</option>
                {Object.values(blocks).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label || b.id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Arrow">
              <select value={arrowLine} onChange={(e) => setArrowLine(e.target.value)} className="sw-mf">
                {ARROWS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {propList.length > 0 && (
            <Field label="Props">
              <div className="flex flex-wrap gap-2">
                {propList.map((p) => {
                  const on = sel.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setSel((s) => {
                          const n = new Set(s);
                          if (n.has(p.id)) n.delete(p.id);
                          else n.add(p.id);
                          return n;
                        })
                      }
                      className={`rounded-full border px-3 py-1 text-xs ${
                        on
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-neutral-300 text-neutral-600"
                      }`}
                    >
                      {p.label || p.id}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
        </div>
        <div className="flex gap-2 border-t border-neutral-200 p-4">
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
      </div>
    </div>
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
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            📱 Switch to mobile view
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
