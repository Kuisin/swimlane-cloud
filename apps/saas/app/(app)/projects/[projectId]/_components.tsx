"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  FolderOpen,
  Plus,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import {
  textToSvg,
  renderPartsPreviewHtml,
  ARROW_LINE_TYPES,
  arrowLineDasharray,
} from "@swimlane-cloud/diagram-converter";
import { THEMES } from "@swimlane-cloud/diagram-converter/themes";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import {
  parseGuiModel,
  applyModelEdit,
  extractPartsCode,
  findAdjacentStepIndex,
  moveRow,
  serializeDSL,
  type GuiRow,
} from "@swimlane-cloud/editor";
import { MobileDiagram } from "@swimlane-cloud/mobile-view";
import { FileTree } from "@/components/file-tree";
import {
  loadState,
  setRole as setRoleAction,
  resetDemo,
  tipFiles,
  primaryPath,
  type Commit,
  type Files,
  type WorkflowState,
  type Role,
} from "@/lib/demo-workflow";
import { demoProjectName } from "@/lib/demo";
import { useT, LanguageToggle } from "@/i18n";

/**
 * Shared project state hook: loads the localStorage workflow state, exposes the
 * role switch + reset, and the project name. Each split page uses this.
 */
export function useProject() {
  const params = useParams();
  const projectId = String(params.projectId);
  const [st, setSt] = useState<WorkflowState | null>(null);
  const { t } = useT();

  useEffect(() => {
    setSt(loadState(projectId));
  }, [projectId]);

  const setRole = (r: Role) => {
    if (st) setSt(setRoleAction(projectId, st, r));
  };
  const reset = () => {
    if (typeof window !== "undefined" && !window.confirm(t("confirm.resetDemo"))) return;
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
  const { t } = useT();
  const TABS = [
    { key: "edit", label: t("nav.edit"), href: "edit" },
    { key: "branches", label: t("nav.branches"), href: "branches" },
    { key: "pulls", label: t("nav.pulls"), href: "pulls" },
    { key: "versions", label: t("nav.versions"), href: "versions" },
  ];
  return (
    <header className="shrink-0 border-b border-neutral-200">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">
            {t("nav.dashboard")}
          </Link>
          <h1 className="text-base font-semibold">{projectName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <RoleSwitch role={role} onChange={onRole} />
          <button onClick={onReset} className="text-xs text-neutral-400 hover:text-neutral-600">
            {t("nav.resetDemo")}
          </button>
        </div>
      </div>
      <nav className="flex gap-1 px-3">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/projects/${projectId}/${tab.href}`}
            className={`border-b-2 px-3 py-2 text-sm ${
              active === tab.key
                ? "border-indigo-600 font-medium text-indigo-600"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function RoleSwitch({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  const { t } = useT();
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
          {r === "manager" ? t("nav.manager") : t("nav.member")}
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
  const { t } = useT();
  return (
    <div
      className={`fixed inset-0 ${z} flex items-end justify-center bg-black/40 sm:items-center`}
      onClick={onClose}
    >
      <div
        className={`flex max-h-[90vh] w-full ${maxW} flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 py-2 pl-4 pr-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="-mr-1 rounded-md p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label={t("close")}
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
        {footer && (
          <div className="border-t border-neutral-200 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function HistoryPanel({
  st,
  branch,
  onTogglePublish,
}: {
  st: WorkflowState;
  branch: string;
  onTogglePublish?: (commitId: string) => void;
}) {
  const { t } = useT();
  const all = st.branches[branch]?.commits ?? [];
  const [detail, setDetail] = useState<{ commit: Commit; parent: Commit | null } | null>(null);
  if (all.length === 0) return <Empty>{t("history.empty")}</Empty>;
  const view = [...all].reverse();
  return (
    <>
      <ol className="space-y-2">
        {view.map((c) => {
          const idx = all.indexOf(c);
          const parent = idx > 0 ? all[idx - 1] : null;
          const isTip = idx === all.length - 1;
          return (
            <li key={c.id} className="rounded-md border border-neutral-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-medium">
                    {c.flagged && (
                      <Flag size={13} className="shrink-0 text-amber-500" fill="currentColor" />
                    )}
                    <span className="truncate">{c.message}</span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {c.author} · {new Date(c.ts).toLocaleString()}
                    {isTip && (
                      <span className="ml-2 rounded bg-green-100 px-1 text-green-700">{t("history.tip")}</span>
                    )}
                  </div>
                  {c.flagged && c.publicSlug && (
                    <a
                      href={`/p/${c.publicSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-block font-mono text-xs text-emerald-600 underline"
                    >
                      /p/{c.publicSlug}
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {onTogglePublish && (
                    <button
                      onClick={() => onTogglePublish(c.id)}
                      title={c.flagged ? t("history.unpublish") : t("history.publishHint")}
                      className={`rounded p-1.5 ${
                        c.flagged
                          ? "text-emerald-600"
                          : "text-neutral-300 hover:text-neutral-500"
                      }`}
                    >
                      <Flag size={15} fill={c.flagged ? "currentColor" : "none"} />
                    </button>
                  )}
                  <button
                    onClick={() => setDetail({ commit: c, parent })}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs hover:border-indigo-400 hover:text-indigo-600"
                  >
                    {t("history.view")}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {detail && (
        <CommitDetailModal
          commit={detail.commit}
          parent={detail.parent}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

/**
 * Full snapshot of a commit: all files at that point, with per-file Preview
 * (on-device render), Diff (side-by-side vs the previous commit), and raw Text.
 */
function CommitDetailModal({
  commit,
  parent,
  onClose,
}: {
  commit: Commit;
  parent: Commit | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const files = commit.files;
  const prev = parent?.files ?? {};
  const paths = Array.from(new Set([...Object.keys(files), ...Object.keys(prev)]))
    .filter((p) => p.endsWith(".txt"))
    .sort();
  const [path, setPath] = useState(primaryPath(files) ?? paths[0] ?? "");
  const [mode, setMode] = useState<"preview" | "diff" | "text">("preview");
  const after = files[path] ?? "";
  const before = prev[path] ?? "";
  const changed = before !== after;
  const svg = useMemo(() => {
    if (mode !== "preview" || !after) return null;
    try {
      return textToSvg(after, { themeKey: "basic" }).svg;
    } catch {
      return null;
    }
  }, [after, mode]);

  const statusOf = (p: string): "added" | "removed" | "changed" | "same" =>
    !(p in prev) ? "added" : !(p in files) ? "removed" : prev[p] !== files[p] ? "changed" : "same";
  const status = statusOf(path);
  const statusBadge =
    status === "added"
      ? "bg-green-100 text-green-700"
      : status === "removed"
        ? "bg-red-100 text-red-700"
        : status === "changed"
          ? "bg-amber-100 text-amber-700"
          : "bg-neutral-100 text-neutral-500";

  return (
    <Modal title={commit.message} onClose={onClose} maxW="max-w-4xl">
      <div className="flex gap-4">
        <aside className="max-h-[62vh] w-44 shrink-0 overflow-auto border-r border-neutral-200 pr-2">
          <FileTree paths={paths} active={path} onPick={setPath} statusOf={statusOf} />
        </aside>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-xs text-neutral-500">{path}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${statusBadge}`}>{status}</span>
            <div className="ml-auto flex gap-1 text-xs">
              {(["preview", "diff", "text"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded px-3 py-1 ${
                    mode === m ? "bg-neutral-800 text-white" : "text-neutral-500 hover:bg-neutral-100"
                  }`}
                >
                  {t(`commit.mode.${m}`)}
                </button>
              ))}
            </div>
          </div>

          {mode === "preview" &&
            (svg ? (
              <div
                className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <Empty>{t("commit.renderError")}</Empty>
            ))}
          {mode === "diff" &&
            (changed ? (
              <Diff path={path} before={before} after={after} />
            ) : (
              <Empty>{t("commit.noChange")}</Empty>
            ))}
          {mode === "text" && (
            <pre className="overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-3 font-mono text-xs">
              {after || "(empty)"}
            </pre>
          )}
        </div>
      </div>
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
  const { t } = useT();
  const reviewing = reviewPR ? st.prs.find((p) => p.id === reviewPR) ?? null : null;
  if (st.prs.length === 0)
    return <Empty>{t("pr.empty")}</Empty>;
  return (
    <>
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

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => onReview(pr.id)}
                className="text-xs text-indigo-600 hover:underline"
              >
                {reviewPR === pr.id
                  ? t("pr.hideFiles")
                  : changed.length === 1
                    ? t("pr.reviewFile")
                    : t("pr.reviewFiles", { n: String(changed.length) })}
              </button>
              {pr.status === "open" && (
                <div className="ml-auto flex items-center gap-2">
                  {canClose && (
                    <button
                      onClick={() => onClose(pr.id)}
                      className="rounded border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
                    >
                      {t("pr.close")}
                    </button>
                  )}
                  {isManager ? (
                    <button
                      onClick={() => onMerge(pr.id)}
                      className="rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-500"
                    >
                      {t("pr.mergeTo", { base: pr.base })}
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-400">{t("pr.managerMerges")}</span>
                  )}
                </div>
              )}
            </div>

            <PrComments pr={pr} role={st.role} onComment={onComment} />
          </li>
        );
      })}
    </ul>
    {reviewing && (
      <CommitDetailModal
        commit={{
          id: reviewing.id,
          message: `${reviewing.title}  (${reviewing.head} → ${reviewing.base})`,
          author: reviewing.author,
          ts: reviewing.ts,
          files: tipFiles(st.branches[reviewing.head]),
        }}
        parent={{
          id: `${reviewing.id}_base`,
          message: "",
          author: reviewing.author,
          ts: reviewing.ts,
          files: tipFiles(st.branches[reviewing.base]),
        }}
        onClose={() => onReview(reviewing.id)}
      />
    )}
    </>
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
  const { t } = useT();
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
          placeholder={t("pr.commentAs", { role })}
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
          {t("pr.comment")}
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
  onPublish: (id: string, shareMode: "svg_only" | "svg_and_dsl") => void;
  onUnpublish: (id: string) => void;
}) {
  const { t } = useT();
  const [dslEnabled, setDslEnabled] = useState<Record<string, boolean>>({});
  if (st.versions.length === 0)
    return <Empty>{t("version.empty")}</Empty>;
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
                    {t("version.promoteTo")}
                  </button>
                ) : (
                  <span className="text-xs text-neutral-400">{t("version.managerPromotes")}</span>
                )
              ) : (
                <>
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                    {t("version.onMain")}
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
                          {t("version.unpublish")}
                        </button>
                      )}
                    </>
                  ) : isManager ? (
                    <div className="flex flex-col items-end gap-1.5">
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-500">
                        <input
                          type="checkbox"
                          className="h-3 w-3"
                          checked={dslEnabled[v.id] ?? false}
                          onChange={(e) =>
                            setDslEnabled((prev) => ({ ...prev, [v.id]: e.target.checked }))
                          }
                        />
                        {t("version.includeDsl")}
                      </label>
                      <button
                        onClick={() =>
                          onPublish(v.id, dslEnabled[v.id] ? "svg_and_dsl" : "svg_only")
                        }
                        className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                      >
                        {t("version.publish")}
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-400">{t("version.notPublished")}</span>
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
  const { t, lang } = useT();
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
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
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

  const insertStep = (afterStepIndex: number) => {
    const next = applyModelEdit(dsl, (draft) => {
      const i = nthStepRowIndex(draft.rows, afterStepIndex);
      const insertAt = i >= 0 ? i + 1 : draft.rows.length;
      draft.rows.splice(insertAt, 0, {
        kind: "step",
        role: gui.lanes[0]?.id ?? "",
        text: "New step",
      });
    });
    setDsl(next);
    onSave?.(active, next);
  };

  const deleteStepAt = (stepIndex: number) => {
    const next = applyModelEdit(dsl, (draft) => {
      const i = nthStepRowIndex(draft.rows, stepIndex);
      if (i >= 0) draft.rows.splice(i, 1);
    });
    setDsl(next);
    onSave?.(active, next);
    if (editStep === stepIndex) setEditStep(null);
  };

  const deleteStep = () => {
    if (editStep == null) return;
    deleteStepAt(editStep);
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

  // Drag-reorder from the mobile view. `fromRow`/`toRow` are raw `model.rows`
  // indices (the mobile tree exposes them), so a step can be inserted at any gap
  // — including before/after/between groups, across group boundaries. The move
  // is on the raw model (same parse the mobile uses) and is rejected if it would
  // introduce new parse errors.
  const moveStepRows = (fromRow: number, toRow: number) => {
    const model = parseDSL(dsl) as unknown as { rows: GuiRow[]; errors?: unknown[] };
    const rows = model.rows;
    if (fromRow < 0 || fromRow >= rows.length || rows[fromRow]?.kind !== "step") return;
    if (toRow === fromRow) return;
    const before = model.errors?.length ?? 0;
    const movedRows = moveRow(rows, fromRow, toRow).rows;
    const next = serializeDSL({ ...model, rows: movedRows });
    const after = (parseDSL(next) as unknown as { errors?: unknown[] }).errors?.length ?? 0;
    if (after > before) return; // don't apply a move that breaks the DSL
    setDsl(next);
    onSave?.(active, next);
  };

  return (
    <div className="flex h-full flex-col bg-neutral-100">
      {paths.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2">
          <button
            onClick={() => setShowFiles(true)}
            className="flex items-center gap-2 rounded-md border border-neutral-300 px-2.5 py-1.5 hover:border-indigo-400"
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
          lang={lang}
          editable={editable}
          onEditStep={editable ? (i) => setEditStep(i) : undefined}
          onDeleteStep={editable ? (i) => setPendingDelete(i) : undefined}
          onInsertStep={editable ? insertStep : undefined}
          onMoveStep={editable ? moveStepRows : undefined}
          onAddStep={editable ? addStep : undefined}
          insertStepLabel={t("mobile.insertStep")}
          addStepLabel={t("mobile.addStep")}
        />
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
      {pendingDelete != null && (
        <Modal
          title={t("stepEdit.deleteStep")}
          onClose={() => setPendingDelete(null)}
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="flex-1 rounded-lg border border-neutral-300 py-2.5 text-sm"
              >
                {t("stepEdit.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteStepAt(pendingDelete);
                  setPendingDelete(null);
                }}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
              >
                {t("stepEdit.deleteStep")}
              </button>
            </div>
          }
        >
          <p className="text-sm text-neutral-600">{t("mobile.confirmDeleteStep")}</p>
        </Modal>
      )}
      {showFiles && (
        <Modal title={t("mobile.files")} onClose={() => setShowFiles(false)}>
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
  const { t } = useT();
  const groups: Record<string, string[]> = {};
  for (const p of paths) {
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    (groups[dir] ||= []).push(p);
  }
  const dirs = Object.keys(groups).sort();
  if (paths.length === 0) return <Empty>{t("mobile.noFiles")}</Empty>;
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

// Arrow stroke options come from the engine so the picker never drifts from
// what actually renders. i18n keys per type (fallback handled in ArrowPicker).
const ARROW_LABEL_KEY: Record<string, string> = {
  solid: "stepEdit.arrow.solid",
  dashed: "stepEdit.arrow.dashed",
  dotted: "stepEdit.arrow.dotted",
  "long-dash": "stepEdit.arrow.longDash",
  "dash-dot": "stepEdit.arrow.dashDot",
};

// Shared step-edit field styling. text-base (16px) stops iOS Safari auto-zooming on focus.
const FIELD_CLASS =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

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
  const { t } = useT();
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
          title={t("stepEdit.deleteStep")}
          className="rounded-lg border border-red-200 px-3 py-2.5 text-red-600 hover:bg-red-50"
        >
          <Trash2 size={16} />
        </button>
      )}
      <button
        onClick={onClose}
        className="flex-1 rounded-lg border border-neutral-300 py-2.5 text-sm"
      >
        {t("stepEdit.cancel")}
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
        className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        {t("stepEdit.save")}
      </button>
    </div>
  );

  return (
    <Modal title={t("stepEdit.title")} onClose={onClose} z="z-[60]" footer={footer}>
      <div className="space-y-3">
        {onMove && (
          <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
            <span className="text-xs font-medium text-neutral-500">{t("stepEdit.movePosition")}</span>
            <div className="flex gap-2">
              <button
                onClick={() => onMove("up")}
                disabled={!canMoveUp}
                title={t("stepEdit.moveUp")}
                className="rounded-md border border-neutral-300 bg-white p-2 text-neutral-600 hover:border-indigo-400 disabled:opacity-40"
              >
                <ArrowUp size={16} />
              </button>
              <button
                onClick={() => onMove("down")}
                disabled={!canMoveDown}
                title={t("stepEdit.moveDown")}
                className="rounded-md border border-neutral-300 bg-white p-2 text-neutral-600 hover:border-indigo-400 disabled:opacity-40"
              >
                <ArrowDown size={16} />
              </button>
            </div>
          </div>
        )}
        <Field label={t("stepEdit.role")}>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={FIELD_CLASS}>
            {!role && <option value="">{t("stepEdit.chooseRole")}</option>}
            {lanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label || l.id}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("stepEdit.text")}>
          <input value={text} onChange={(e) => setText(e.target.value)} className={FIELD_CLASS} />
        </Field>
        <Field label={t("stepEdit.description")}>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label={t("stepEdit.remark")}>
          <textarea
            rows={2}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label={t("stepEdit.block")}>
          <BlockPicker value={blockRef} blocks={blocks} dsl={dsl} onChange={setBlockRef} />
        </Field>
        <Field label={t("stepEdit.arrow")}>
          <ArrowPicker value={arrowLine} onChange={setArrowLine} />
        </Field>
        {propList.length > 0 && (
          <Field label={t("stepEdit.props")}>
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
  const { t } = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">{t("mobilePrompt.title")}</h2>
        <p className="mt-1 text-sm text-neutral-600">{t("mobilePrompt.body")}</p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={onMobile}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <Smartphone size={16} /> {t("mobilePrompt.switchMobile")}
          </button>
          <button
            onClick={onStay}
            className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600"
          >
            {t("mobilePrompt.stayEditor")}
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
  const cls = compact
    ? "[&_svg]:h-7 [&_svg]:w-auto [&_svg]:max-w-[140px]"
    : "flex w-full items-center justify-center [&_svg]:h-auto [&_svg]:max-h-32 [&_svg]:max-w-full";
  return <div className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
}

function PartsPreviewHover({
  dsl,
  section,
  id,
  children,
  className = "",
}: {
  dsl: string;
  section: "block" | "prop";
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const html = useMemo(() => {
    if (!id) return "";
    try {
      const code = extractPartsCode(dsl, section, id);
      if (!code) return "";
      return renderPartsPreviewHtml(code, THEMES.basic);
    } catch {
      return "";
    }
  }, [dsl, section, id]);

  useLayoutEffect(() => {
    if (!anchor || !html || !tipRef.current) return;
    const rect = tipRef.current.getBoundingClientRect();
    let left = anchor.x + 12;
    let top = anchor.y + 12;
    if (left + rect.width > window.innerWidth - 8) left = Math.max(8, anchor.x - rect.width - 12);
    if (top + rect.height > window.innerHeight - 8) top = Math.max(8, anchor.y - rect.height - 12);
    setPos({ left, top });
  }, [anchor, html]);

  return (
    <>
      <span
        className={`cursor-help ${className}`}
        onMouseEnter={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setAnchor(null)}
      >
        {children}
      </span>
      {anchor &&
        html &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tipRef}
            className="pointer-events-none fixed z-[100] max-w-[min(280px,calc(100vw-16px))] rounded-lg border border-neutral-200 bg-white p-2 shadow-lg"
            style={{ left: pos.left, top: pos.top }}
          >
            <div className="mb-1.5 font-mono text-[10px] text-neutral-500">
              {section} · {id}
            </div>
            <div
              className="flex max-h-40 items-center justify-center overflow-auto rounded-md border border-neutral-100 bg-neutral-50 p-2 [&_svg]:h-auto [&_svg]:max-h-32 [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

function ArrowPreview({ kind }: { kind: string }) {
  const dash = arrowLineDasharray(kind) ?? undefined;
  return (
    <svg width="96" height="14" viewBox="0 0 96 14" aria-hidden>
      <line
        x1="2"
        y1="7"
        x2="84"
        y2="7"
        stroke="#475569"
        strokeWidth="2"
        strokeDasharray={dash}
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
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const noneLabel = t("stepEdit.none");
  const current = value ? blocks[value]?.label || value : noneLabel;
  const opts = [
    { id: "", label: noneLabel },
    ...Object.values(blocks).map((b) => ({ id: b.id, label: b.label || b.id })),
  ];
  return (
    <>
      <PickerTrigger
        label={current}
        preview={
          value ? (
            <PartsPreviewHover dsl={dsl} section="block" id={value}>
              <PartsPreview dsl={dsl} section="block" id={value} compact />
            </PartsPreviewHover>
          ) : undefined
        }
        onClick={() => setOpen(true)}
      />
      {open && (
        <PickerSheet title={t("stepEdit.block")} onClose={() => setOpen(false)}>
          {opts.map((o) => (
            <PickerTile
              key={o.id || "none"}
              selected={o.id === value}
              label={o.label}
              preview={
                o.id ? (
                  <PartsPreviewHover dsl={dsl} section="block" id={o.id}>
                    <PartsPreview dsl={dsl} section="block" id={o.id} />
                  </PartsPreviewHover>
                ) : undefined
              }
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
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const arrowLabel = (v: string) => t(ARROW_LABEL_KEY[v] ?? "stepEdit.arrow.solid");
  return (
    <>
      <PickerTrigger
        label={arrowLabel(value)}
        preview={<ArrowPreview kind={value} />}
        onClick={() => setOpen(true)}
      />
      {open && (
        <PickerSheet title={t("stepEdit.arrow")} onClose={() => setOpen(false)}>
          {ARROW_LINE_TYPES.map((a) => (
            <PickerTile
              key={a}
              selected={a === value}
              label={arrowLabel(a)}
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
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const list = Object.values(props);
  const count = value.size;
  const selected = list.filter((p) => value.has(p.id));
  return (
    <>
      <PickerTrigger
        label={count ? t("stepEdit.selected", { n: String(count) }) : t("stepEdit.none")}
        preview={
          selected[0] ? (
            <PartsPreviewHover dsl={dsl} section="prop" id={selected[0].id}>
              <PartsPreview dsl={dsl} section="prop" id={selected[0].id} compact />
            </PartsPreviewHover>
          ) : undefined
        }
        onClick={() => setOpen(true)}
      />
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <PartsPreviewHover
              key={p.id}
              dsl={dsl}
              section="prop"
              id={p.id}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[11px] text-indigo-800"
            >
              &lt;{p.id}&gt;
            </PartsPreviewHover>
          ))}
        </div>
      )}
      {open && (
        <PickerSheet title={t("stepEdit.props")} onClose={() => setOpen(false)}>
          {list.map((p) => (
            <PickerTile
              key={p.id}
              selected={value.has(p.id)}
              label={p.label || p.id}
              preview={
                <PartsPreviewHover dsl={dsl} section="prop" id={p.id}>
                  <PartsPreview dsl={dsl} section="prop" id={p.id} />
                </PartsPreviewHover>
              }
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
