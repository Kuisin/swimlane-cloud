"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Flag,
  FolderOpen,
  Plus,
  Smartphone,
  Tag,
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
import { GitHubMark } from "@/components/github-mark";
import { RoleBadge } from "@/components/app-header";
import { branchLabel } from "@/lib/branch-label";
import { ApiClientError, redirectToLogin } from "@/lib/client";
import {
  addPRComment,
  compare,
  getPR,
  getSnapshot,
  getState,
  listCommits,
  versionSvgUrl,
} from "@/lib/workflow";
import type {
  CommitInfo,
  CompareFile,
  PendingChange,
  ProjectState,
  PullComment,
  PullState,
  VersionState,
} from "@/lib/types";
import { useT, LanguageToggle } from "@/i18n";

export type Files = Record<string, string>;

/** primary diagram = first .txt path (sorted) for thumbnails/version SVG. */
export function primaryPath(files: Files): string | null {
  const txt = Object.keys(files)
    .filter((p) => p.endsWith(".txt"))
    .sort();
  return txt[0] ?? null;
}

/** Turn an API failure into a sentence the user can act on. */
export function describeError(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiClientError) {
    if (err.needsAuth) return t("error.needsAuth");
    if (err.conflict) return t("error.conflict");
    if (err.rateLimited) return t("error.rateLimited");
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Shared project state hook: loads `ProjectState` from the API and re-fetches
 * when the tab regains focus (someone else may have merged or pushed).
 */
export function useProject() {
  const params = useParams();
  const projectId = String(params.projectId);
  const [state, setState] = useState<ProjectState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useT();

  const refresh = useCallback(async () => {
    try {
      setState(await getState(projectId));
      setError(null);
    } catch (e) {
      if (e instanceof ApiClientError && e.needsAuth) return redirectToLogin();
      setError(describeError(e, t));
    } finally {
      setLoading(false);
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return {
    projectId,
    projectName: state?.project.name ?? "",
    state,
    refresh,
    loading,
    error,
  };
}

/** Full-height page shell used by every project tab. */
export function ProjectPage({
  active,
  projectId,
  state,
  error,
  children,
}: {
  active: string;
  projectId: string;
  state: ProjectState | null;
  error: string | null;
  children: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="flex h-screen flex-col">
      <ProjectNav projectId={projectId} state={state} active={active} />
      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {state ? (
        children
      ) : (
        <div className="p-6 text-sm text-neutral-500">{error ? null : t("loading")}</div>
      )}
    </div>
  );
}

export function ProjectNav({
  projectId,
  state,
  active,
}: {
  projectId: string;
  state: ProjectState | null;
  active: string;
}) {
  const { t } = useT();
  const TABS = [
    { key: "edit", label: t("nav.edit"), href: "edit" },
    { key: "branches", label: t("nav.branches"), href: "branches" },
    { key: "pulls", label: t("nav.pulls"), href: "pulls" },
    { key: "versions", label: t("nav.versions"), href: "versions" },
    { key: "activity", label: t("nav.activity"), href: "activity" },
    ...(state?.me.role === "owner"
      ? [{ key: "templates", label: t("nav.templates"), href: "settings/templates" }]
      : []),
  ];
  return (
    <header className="shrink-0 border-b border-neutral-200">
      {/* Wraps on phones (name truncates) instead of forcing horizontal page scroll. */}
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5 sm:h-14 sm:px-4 sm:py-0">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href="/dashboard" className="shrink-0 text-sm text-neutral-500 hover:underline">
            {t("nav.dashboard")}
          </Link>
          <h1 className="truncate text-base font-semibold">{state?.project.name ?? ""}</h1>
          {state ? (
            <a
              href={state.project.htmlUrl}
              target="_blank"
              rel="noreferrer"
              title={`${state.project.owner}/${state.project.repo}`}
              className="hidden shrink-0 items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700 sm:flex"
            >
              <GitHubMark className="h-3.5 w-3.5" />
              {state.project.owner}/{state.project.repo}
              <ExternalLink size={11} />
            </a>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageToggle />
          {state ? (
            <>
              <RoleBadge role={state.me.role} />
              <span className="hidden text-xs text-neutral-500 sm:inline">
                {state.me.githubLogin}
              </span>
            </>
          ) : null}
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="whitespace-nowrap text-xs text-neutral-400 hover:text-neutral-600"
            >
              {t("nav.signOut")}
            </button>
          </form>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/projects/${projectId}/${tab.href}`}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
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
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-sm hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-400"
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
          <h2 className="truncate text-base font-semibold">{title}</h2>
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

const short = (sha: string) => sha.slice(0, 7);

/** Commits of one branch, newest first, with a per-commit snapshot viewer. */
export function HistoryPanel({
  projectId,
  state,
  branch,
  onTogglePublish,
}: {
  projectId: string;
  state: ProjectState;
  branch: string;
  /** Present on main for owners: publish / unpublish the version promoted at this commit. */
  onTogglePublish?: (version: VersionState) => void;
}) {
  const { t } = useT();
  const [commits, setCommits] = useState<CommitInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommitInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCommits(null);
    setError(null);
    listCommits(projectId, branch)
      .then((r) => {
        if (!cancelled) setCommits(r.commits);
      })
      .catch((e) => {
        if (!cancelled) setError(describeError(e, t));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, branch]); // eslint-disable-line react-hooks/exhaustive-deps

  const versionAt = (sha: string) =>
    state.versions.find((v) => v.promotedSha === sha || v.commitSha === sha) ?? null;

  if (error) return <Empty>{error}</Empty>;
  if (!commits) return <Empty>{t("loading")}</Empty>;
  if (commits.length === 0) return <Empty>{t("history.empty")}</Empty>;

  return (
    <>
      <ol className="space-y-2">
        {commits.map((c, i) => {
          const version = versionAt(c.sha);
          const published = Boolean(version?.public && version.publicSlug);
          return (
            <li key={c.sha} className="rounded-md border border-neutral-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-medium">
                    {version && (
                      <Tag
                        size={13}
                        className="shrink-0 text-indigo-500"
                        aria-label={version.name}
                      />
                    )}
                    <span className="truncate">{c.message.split("\n")[0]}</span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    <a
                      href={c.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono hover:underline"
                    >
                      {short(c.sha)}
                    </a>{" "}
                    · {c.login ?? c.author} · {c.date ? new Date(c.date).toLocaleString() : ""}
                    {i === 0 && (
                      <span className="ml-2 rounded bg-green-100 px-1 text-green-700">
                        {t("history.tip")}
                      </span>
                    )}
                    {version && <span className="ml-2 text-indigo-600">{version.name}</span>}
                  </div>
                  {published && version?.publicSlug && (
                    <a
                      href={`/p/${version.publicSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-block font-mono text-xs text-emerald-600 underline"
                    >
                      /p/{version.publicSlug}
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {onTogglePublish && version?.promoted && (
                    <button
                      onClick={() => onTogglePublish(version)}
                      title={published ? t("history.unpublish") : t("history.publishHint")}
                      className={`rounded p-1.5 ${
                        published ? "text-emerald-600" : "text-neutral-300 hover:text-neutral-500"
                      }`}
                    >
                      <Flag size={15} fill={published ? "currentColor" : "none"} />
                    </button>
                  )}
                  <button
                    onClick={() => setDetail(c)}
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
          projectId={projectId}
          title={detail.message.split("\n")[0] ?? ""}
          headRef={detail.sha}
          baseRef={detail.parents[0] ?? null}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

type FileStatus = "added" | "removed" | "changed" | "same";

/**
 * Every diagram at `headRef` with per-file Preview (on-device render), Diff
 * against `baseRef` (a parent commit, or a pull request's base) and raw Text.
 * The body of `CommitDetailModal`, factored out so the Push, Request-review,
 * Approve and Publish flows can each drop it into their own modal shell.
 */
export function ChangeBrowser({
  projectId,
  headRef,
  baseRef,
  preloaded,
}: {
  projectId: string;
  headRef: string;
  baseRef: string | null;
  /** Already-fetched changed files (pull request review) — skips the compare call. */
  preloaded?: CompareFile[];
}) {
  const { t } = useT();
  const [files, setFiles] = useState<Files | null>(null);
  const [changes, setChanges] = useState<CompareFile[] | null>(preloaded ?? null);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState("");
  const [mode, setMode] = useState<"preview" | "diff" | "text">("preview");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSnapshot(projectId, headRef),
      preloaded ? Promise.resolve(null) : baseRef ? compare(projectId, baseRef, headRef) : null,
    ])
      .then(([snap, cmp]) => {
        if (cancelled) return;
        setFiles(snap.files);
        if (cmp) setChanges(cmp.files);
        else if (!preloaded) setChanges([]);
      })
      .catch((e) => {
        if (!cancelled) setError(describeError(e, t));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, headRef, baseRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeByPath = useMemo(() => {
    const m = new Map<string, CompareFile>();
    for (const c of changes ?? []) m.set(c.path, c);
    return m;
  }, [changes]);

  const paths = useMemo(() => {
    const set = new Set<string>(Object.keys(files ?? {}));
    for (const c of changes ?? []) set.add(c.path);
    return [...set].filter((p) => p.endsWith(".txt")).sort();
  }, [files, changes]);

  useEffect(() => {
    if (!path && paths.length) {
      const firstChanged = paths.find((p) => changeByPath.has(p));
      setPath(firstChanged ?? paths[0]!);
    }
  }, [paths, path, changeByPath]);

  const change = changeByPath.get(path);
  const after = files?.[path] ?? change?.after ?? "";
  const before = change ? (change.before ?? "") : after;
  const statusOf = (p: string): FileStatus => {
    const c = changeByPath.get(p);
    if (!c) return "same";
    return c.status === "added" ? "added" : c.status === "removed" ? "removed" : "changed";
  };
  const status = statusOf(path);
  const changed = status !== "same";

  const svg = useMemo(() => {
    if (mode !== "preview" || !after) return null;
    try {
      return textToSvg(after, { themeKey: "basic" }).svg;
    } catch {
      return null;
    }
  }, [after, mode]);

  const statusBadge =
    status === "added"
      ? "bg-green-100 text-green-700"
      : status === "removed"
        ? "bg-red-100 text-red-700"
        : status === "changed"
          ? "bg-amber-100 text-amber-700"
          : "bg-neutral-100 text-neutral-500";

  if (error) return <Empty>{error}</Empty>;
  if (!files) return <Empty>{t("loading")}</Empty>;

  return (
    <div className="flex gap-4">
      <aside className="max-h-[62vh] w-44 shrink-0 overflow-auto border-r border-neutral-200 pr-2">
        <FileTree paths={paths} active={path} onPick={setPath} statusOf={statusOf} />
      </aside>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-xs text-neutral-500">{path}</span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${statusBadge}`}>
            {status}
          </span>
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
  );
}

export function CommitDetailModal({
  title,
  onClose,
  ...browserProps
}: {
  projectId: string;
  title: string;
  headRef: string;
  baseRef: string | null;
  preloaded?: CompareFile[];
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} maxW="max-w-4xl">
      <ChangeBrowser {...browserProps} />
    </Modal>
  );
}

const CHANGE_BADGE: Record<PendingChange["status"], string> = {
  added: "bg-green-100 text-green-700",
  removed: "bg-red-100 text-red-700",
  changed: "bg-amber-100 text-amber-700",
};

/** A plain colour-coded file list, for modals that only need "what changed" without a diff viewer. */
export function ChangeList({ changes }: { changes: PendingChange[] }) {
  const { t } = useT();
  if (changes.length === 0) return <Empty>{t("changes.empty")}</Empty>;
  return (
    <ul className="max-h-64 space-y-1 overflow-auto rounded-md border border-neutral-200 p-2">
      {changes.map((c) => (
        <li key={c.path} className="flex items-center gap-2 text-sm">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${CHANGE_BADGE[c.status]}`}>
            {t(`changes.status.${c.status}`)}
          </span>
          <span className="truncate font-mono text-xs">{c.path}</span>
        </li>
      ))}
    </ul>
  );
}

export function PrPanel({
  projectId,
  state,
  isOwner,
  onMerge,
  onClose,
}: {
  projectId: string;
  state: ProjectState;
  isOwner: boolean;
  onMerge: (pr: PullState) => void;
  onClose: (pr: PullState) => void;
}) {
  const { t } = useT();
  if (state.pulls.length === 0) return <Empty>{t("pr.empty")}</Empty>;
  return (
    <ul className="space-y-3">
      {state.pulls.map((pr) => (
        <PrItem
          key={pr.number}
          projectId={projectId}
          pr={pr}
          me={state.me.githubLogin}
          isOwner={isOwner}
          onMerge={onMerge}
          onClose={onClose}
        />
      ))}
    </ul>
  );
}

function PrItem({
  projectId,
  pr,
  me,
  isOwner,
  onMerge,
  onClose,
}: {
  projectId: string;
  pr: PullState;
  me: string;
  isOwner: boolean;
  onMerge: (pr: PullState) => void;
  onClose: (pr: PullState) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<{ comments: PullComment[]; files: CompareFile[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [showFiles, setShowFiles] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getPR(projectId, pr.number);
      setDetail({ comments: d.comments, files: d.files });
      setError(null);
    } catch (e) {
      setError(describeError(e, t));
    }
  }, [projectId, pr.number]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && !detail) void load();
  }, [open, detail, load]);

  const canClose = pr.state === "open" && (isOwner || pr.author === me);
  const badge = pr.merged
    ? "bg-purple-100 text-purple-700"
    : pr.state === "closed"
      ? "bg-neutral-200 text-neutral-600"
      : "bg-amber-100 text-amber-700";
  const badgeLabel = pr.merged ? "merged" : pr.state;

  return (
    <li className="rounded-md border border-neutral-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">
            <a href={pr.htmlUrl} target="_blank" rel="noreferrer" className="hover:underline">
              #{pr.number} {pr.title}
            </a>
          </div>
          <div className="text-xs text-neutral-500">
            {branchLabel(pr.head, t)} → {branchLabel(pr.base, t)} ·{" "}
            {t("pr.openedBy", { login: pr.author })}
            {pr.createdAt ? ` · ${new Date(pr.createdAt).toLocaleString()}` : ""}
          </div>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${badge}`}>{badgeLabel}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs text-indigo-600 hover:underline"
        >
          {open ? t("pr.hide") : t("pr.review")}
        </button>
        {open && detail && (
          <button
            onClick={() => setShowFiles(true)}
            className="text-xs text-indigo-600 hover:underline"
          >
            {detail.files.length === 1
              ? t("pr.reviewFile")
              : t("pr.reviewFiles", { n: String(detail.files.length) })}
          </button>
        )}
        {pr.state === "open" && (
          <div className="ml-auto flex items-center gap-2">
            {canClose && (
              <button
                onClick={() => onClose(pr)}
                className="rounded border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
              >
                {t("pr.close")}
              </button>
            )}
            {isOwner ? (
              <button
                onClick={() => onMerge(pr)}
                className="rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-500"
              >
                {t("pr.mergeTo", { base: pr.base })}
              </button>
            ) : (
              <span className="text-xs text-neutral-400">{t("pr.ownerMerges")}</span>
            )}
          </div>
        )}
      </div>

      {open && (
        <div className="mt-3 border-t border-neutral-100 pt-2">
          {error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : !detail ? (
            <p className="text-xs text-neutral-400">{t("loading")}</p>
          ) : (
            <PrComments
              projectId={projectId}
              pr={pr}
              me={me}
              comments={detail.comments}
              onPosted={(c) => setDetail({ ...detail, comments: [...detail.comments, c] })}
            />
          )}
        </div>
      )}

      {showFiles && detail && (
        <CommitDetailModal
          projectId={projectId}
          title={`#${pr.number} ${pr.title}  (${branchLabel(pr.head, t)} → ${branchLabel(pr.base, t)})`}
          headRef={pr.state === "open" ? pr.head : pr.headSha || pr.head}
          baseRef={pr.state === "open" ? pr.base : pr.baseSha || pr.base}
          preloaded={detail.files}
          onClose={() => setShowFiles(false)}
        />
      )}
    </li>
  );
}

function PrComments({
  projectId,
  pr,
  me,
  comments,
  onPosted,
}: {
  projectId: string;
  pr: PullState;
  me: string;
  comments: PullComment[];
  onPosted: (c: PullComment) => void;
}) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { comment } = await addPRComment(projectId, pr.number, text);
      onPosted(comment);
      setText("");
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {comments.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md bg-neutral-50 px-2 py-1.5 text-sm">
              <span className="mr-2 text-xs font-medium text-neutral-500">{c.author}</span>
              <span className="whitespace-pre-wrap">{c.body}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mb-1 text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void post();
          }}
          placeholder={t("pr.commentAs", { login: me })}
          className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
        />
        <button
          onClick={() => void post()}
          disabled={!text.trim() || busy}
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
  projectId,
  state,
  isOwner,
  onPromote,
  onPublish,
  onUnpublish,
}: {
  projectId: string;
  state: ProjectState;
  isOwner: boolean;
  onPromote: (v: VersionState) => void;
  onPublish: (v: VersionState, shareMode: "svg_only" | "svg_and_dsl") => void;
  onUnpublish: (v: VersionState) => void;
}) {
  const { t } = useT();
  const [dslEnabled, setDslEnabled] = useState<Record<string, boolean>>({});
  if (state.versions.length === 0) return <Empty>{t("version.empty")}</Empty>;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {state.versions.map((v) => {
        const first = v.files[0]?.path;
        return (
          <li key={v.id} className="rounded-md border border-neutral-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate font-medium">
                  <Tag size={13} className="shrink-0 text-indigo-500" />
                  {v.name}
                </div>
                {v.note && <div className="truncate text-xs text-neutral-500">{v.note}</div>}
                <div className="text-xs text-neutral-400">
                  {new Date(v.createdAt).toLocaleString()}
                  {v.createdBy ? ` · ${v.createdBy}` : ""} ·{" "}
                  <a
                    href={`${state.project.htmlUrl}/commit/${v.commitSha}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono hover:underline"
                  >
                    {short(v.commitSha)}
                  </a>
                  {v.tag ? ` · ${v.tag}` : ""} · {t("version.files", { n: String(v.files.length) })}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {!v.promoted ? (
                  isOwner ? (
                    <button
                      onClick={() => onPromote(v)}
                      className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                    >
                      {t("version.promoteTo")}
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-400">{t("version.ownerPromotes")}</span>
                  )
                ) : (
                  <>
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                      {t("version.onMain")}
                    </span>
                    {v.public && v.publicSlug ? (
                      <>
                        <a
                          href={`/p/${v.publicSlug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-indigo-600 underline"
                        >
                          /p/{v.publicSlug}
                        </a>
                        {isOwner && (
                          <button
                            onClick={() => onUnpublish(v)}
                            className="text-xs text-neutral-400 hover:text-neutral-600"
                          >
                            {t("version.unpublish")}
                          </button>
                        )}
                      </>
                    ) : isOwner ? (
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
                            onPublish(v, dslEnabled[v.id] ? "svg_and_dsl" : "svg_only")
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
            {first && (
              <div className="mt-2 max-h-48 overflow-auto rounded border border-neutral-100 bg-white p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={versionSvgUrl(projectId, v.id, first)}
                  alt={first}
                  className="mx-auto h-auto max-w-full"
                  loading="lazy"
                />
              </div>
            )}
          </li>
        );
      })}
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
  const paths = Object.keys(files)
    .filter((p) => p.endsWith(".txt"))
    .sort();
  const [pathState, setPathState] = useState(primaryPath(files) ?? paths[0] ?? "");
  const path = pathProp ?? pathState;
  const setPath = (p: string) => (onPath ? onPath(p) : setPathState(p));
  const active = files[path] !== undefined ? path : (paths[0] ?? "");
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
  const canMoveDown =
    editRowIndex >= 0 && findAdjacentStepIndex(gui.rows, editRowIndex, "down") >= 0;
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
            <span className="text-xs font-medium text-neutral-500">
              {t("stepEdit.movePosition")}
            </span>
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
export function MobilePrompt({ onMobile, onStay }: { onMobile: () => void; onStay: () => void }) {
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
      <line x1="2" y1="7" x2="84" y2="7" stroke="#475569" strokeWidth="2" strokeDasharray={dash} />
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
