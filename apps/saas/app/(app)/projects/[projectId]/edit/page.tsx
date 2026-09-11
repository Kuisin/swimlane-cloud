"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  GitPullRequest,
  LayoutList,
  Lock,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Smartphone,
  Upload,
} from "lucide-react";
import { clearLocalMirror, DslEditor } from "@swimlane-cloud/editor";
import "@swimlane-cloud/editor/styles.css";
import { INTEGRATION_BRANCH, isEditBranch, PROD_BRANCH } from "@swimlane-cloud/github-client";
import { branchKindOf, branchLabel } from "@/lib/branch-label";
import { createSaasHost } from "@/lib/saas-host";
import { dslOf, isMarkdownFile } from "@/lib/diagram-file";
import { DocumentView } from "../_document-view";
import {
  abandonEdit,
  branchOf,
  canEditBranch,
  defaultBranch,
  discardDrafts,
  editLockReason,
  getSnapshot,
  isLocked,
  renameFile,
  resolveFileId,
  saveDrafts,
  startEdit,
} from "@/lib/workflow";
import {
  ProjectPage,
  Action,
  Badge,
  MobileView,
  MobilePrompt,
  describeError,
  isMobileDevice,
  useProject,
  type Files,
} from "../_components";
import {
  ConvertMarkdownModal,
  DiscardEditModal,
  MigrateSpellingsModal,
  PushModal,
  RequestReviewModal,
} from "./_modals";
import { useT } from "@/i18n";

const VIEW_PREF = "sw-view-mode";

function LoadingFallback() {
  const { t } = useT();
  return <div className="p-6 text-sm text-neutral-500">{t("loading")}</div>;
}

export default function EditPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EditPageInner />
    </Suspense>
  );
}

function BranchChip({
  active,
  label,
  dot,
  locked,
  onClick,
}: {
  active: boolean;
  label: string;
  dot?: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap ${
        active
          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
          : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
      }`}
    >
      {locked && <Lock size={11} />}
      {label}
      {dot && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />}
    </button>
  );
}

function EditPageInner() {
  const { projectId, state, refresh, error } = useProject();
  const { t, lang } = useT();
  const router = useRouter();
  const sp = useSearchParams();

  const [branchParam, setBranchParam] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [mFile, setMFile] = useState<string | undefined>(undefined);
  // Read through a ref so the host identity does not change per open file:
  // rebuilding it would remount the editor and drop its state.
  const activeFileRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    activeFileRef.current = mFile;
  }, [mFile]);
  // Path -> stable file id for whatever the tree last listed, so the URL can
  // carry `fid` alongside the human-readable `file` path (saas-host.ts fires
  // this from the same tree fetch the editor already makes).
  const [fidByPath, setFidByPath] = useState<Record<string, string>>({});
  const [mStep, setMStep] = useState<number | null>(null);
  const [mobileFiles, setMobileFiles] = useState<Files | null>(null);
  // Document view: `null` means "whatever suits this file", which a prose-only
  // `.md` answers with Document. An explicit toggle wins until the file changes.
  const [docPref, setDocPref] = useState<boolean | null>(null);
  const [docByDefault, setDocByDefault] = useState(false);
  const [localDirty, setLocalDirty] = useState(false);
  const [autosavePending, setAutosavePending] = useState(false);
  const [headMoved, setHeadMoved] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPush, setShowPush] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [showSpelling, setShowSpelling] = useState(false);
  const [reviewRequested, setReviewRequested] = useState<number | null>(null);
  const restored = useRef(false);
  // Gates the editor/mobile content until URL state is restored, so the editor
  // doesn't auto-open the first file before `?file=` is applied.
  const [ready, setReady] = useState(false);

  const branch = state ? defaultBranch(state, branchParam) : INTEGRATION_BRANCH;
  const branchState = state ? branchOf(state, branch) : undefined;
  const role = state?.me.role ?? "viewer";
  const editable = state ? canEditBranch(state, branch) : false;
  const readOnly = !editable;
  const mirrorScope = `${projectId}:${branch}`;

  // My active edit branch, if I have one and it still exists on the repo.
  const myEdit =
    state?.activeEdit && branchOf(state, state.activeEdit.branch) ? state.activeEdit : null;
  const myEditState = myEdit ? branchOf(state!, myEdit.branch) : undefined;
  const onMyEdit = Boolean(myEdit) && myEdit!.branch === branch;
  const onEditBranch = isEditBranch(branch);
  const locked = state ? isLocked(state, branch) : false;
  const lockReasonKey = state ? editLockReason(state, branch) : null;
  const lockReason = lockReasonKey ? t(`edit.lock.${lockReasonKey}`) : null;
  const hasUnpushed = localDirty || Boolean(branchState?.dirty);
  // preview is review-only, so drafts on it can only be leftovers from before
  // that rule; they are invisible there and need carrying over or discarding.
  const previewLeftovers =
    branch === INTEGRATION_BRANCH && Boolean(branchState?.dirty) && role !== "viewer";

  const host = useMemo(
    () =>
      createSaasHost({
        projectId,
        branch,
        editable,
        activeDocumentId: () => activeFileRef.current ?? "",
        onFileList: (files) => setFidByPath(Object.fromEntries(files.map((f) => [f.id, f.fid]))),
        onHeadChange: (sha) => setHeadMoved((prev) => prev ?? sha),
        onDraftSaved: () => setLocalDirty(true),
        onCheckpoint: () => {
          setLocalDirty(false);
          clearLocalMirror(mirrorScope);
          void refresh();
        },
      }),
    [projectId, branch, editable, mirrorScope, reload], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!state || restored.current) return;
    restored.current = true;
    const v = sp.get("view");
    if (v === "mobile") setMobile(true);
    else if (v === "editor") setMobile(false);
    else {
      const pref = localStorage.getItem(VIEW_PREF);
      if (pref === "mobile") setMobile(true);
      else if (isMobileDevice() && sessionStorage.getItem("sw-mobile-asked") !== "1") {
        setShowPrompt(true);
      }
    }
    const b = sp.get("branch");
    if (b) setBranchParam(b);
    const f = sp.get("file");
    const s = sp.get("step");
    if (s != null && s !== "") {
      const n = Number(s);
      if (!Number.isNaN(n)) setMStep(n);
    }

    // `fid` (a stable file id) takes priority over `file` (a folder path):
    // it is the only one of the two that keeps pointing at the same file
    // once that file has moved. Fall back to `file` — and, failing that, to
    // whatever the editor opens by default — when `fid` doesn't resolve
    // (garbage id, or the file was deleted), same as an old `?file=` link
    // whose path no longer exists.
    const fid = sp.get("fid");
    if (fid) {
      resolveFileId(projectId, fid)
        .then((res) => {
          if (res.path) setMFile(res.path);
          else {
            if (f) setMFile(f);
            setNotice(t("edit.fileNotFound"));
          }
        })
        .catch(() => {
          if (f) setMFile(f);
        })
        .finally(() => setReady(true));
      return;
    }
    if (f) setMFile(f);
    setReady(true);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!restored.current) return;
    const params = new URLSearchParams(sp.toString());
    params.set("branch", branch);
    params.set("view", mobile ? "mobile" : "editor");
    if (mFile) params.set("file", mFile);
    else params.delete("file");
    const fid = mFile ? fidByPath[mFile] : undefined;
    if (fid) params.set("fid", fid);
    else params.delete("fid");
    if (mStep != null) params.set("step", String(mStep));
    else params.delete("step");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [branch, mobile, mFile, mStep, fidByPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switching branch resets per-branch UI state.
  useEffect(() => {
    setHeadMoved(null);
    setLocalDirty(false);
    setAutosavePending(false);
    setMobileFiles(null);
    setReviewRequested(null);
  }, [branch]);

  // Unpushed drafts already live on the server (autosave got them there), so
  // only an in-flight autosave — the few seconds before it reaches Postgres —
  // is worth warning about before the tab closes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!autosavePending) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [autosavePending]);

  // Mobile view edits a full snapshot (committed text + drafts).
  const loadMobile = useCallback(async () => {
    try {
      const snap = await getSnapshot(projectId, branch, true);
      setMobileFiles(snap.files);
    } catch (e) {
      setNotice(describeError(e, t));
    }
  }, [projectId, branch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mobile && ready && !mobileFiles) void loadMobile();
  }, [mobile, ready, mobileFiles, loadMobile]);

  // A `.md` holding only prose is a document, not a diagram, so open it in the
  // view that can edit it. This reads through the same host cache the editor is
  // about to read from, so it costs nothing extra.
  useEffect(() => {
    setDocPref(null);
    setDocByDefault(false);
    if (!ready || mobile || !mFile || !isMarkdownFile(mFile)) return;
    let cancelled = false;
    void host
      .readStored(mFile)
      .then((text) => {
        if (!cancelled) setDocByDefault(dslOf(mFile, text) === null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ready, mobile, mFile, host]);

  // Diagrams still stored as raw DSL. The tree listing already gave us every
  // path, so offering the conversion costs no extra request — and the offer
  // disappears by itself once a project has none left.
  const legacyCount = Object.keys(fidByPath).filter((p) => p.toLowerCase().endsWith(".txt")).length;

  const markdownFile = !!mFile && isMarkdownFile(mFile);
  const docView = markdownFile && (docPref ?? docByDefault);

  const chooseMobile = () => {
    localStorage.setItem(VIEW_PREF, "mobile");
    sessionStorage.setItem("sw-mobile-asked", "1");
    setMobile(true);
    setShowPrompt(false);
  };
  const stayEditor = () => {
    sessionStorage.setItem("sw-mobile-asked", "1");
    setShowPrompt(false);
  };
  const toggleView = () => {
    setMobile((m) => {
      const next = !m;
      localStorage.setItem(VIEW_PREF, next ? "mobile" : "editor");
      return next;
    });
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice(describeError(e, t));
    } finally {
      setBusy(null);
    }
  };

  const doStartEdit = () => {
    void run("start", async () => {
      const res = await startEdit(projectId);
      await refresh();
      setBranchParam(res.branch);
      setReload((r) => r + 1);
    });
  };

  const doBackToEdit = () => {
    if (myEdit) setBranchParam(myEdit.branch);
  };

  const doDiscard = () => {
    if (!myEdit) return;
    void run("discard", async () => {
      await abandonEdit(projectId, myEdit.id);
      setShowDiscard(false);
      await refresh();
      setBranchParam(INTEGRATION_BRANCH);
      setReload((r) => r + 1);
    });
  };

  function handlePushed(result: { commitSha: string }) {
    setShowPush(false);
    setLocalDirty(false);
    setHeadMoved(null);
    clearLocalMirror(mirrorScope);
    // The editor keeps its documents — they are exactly what was just
    // committed. It only needs to know the tip moved because of us, so the
    // next listing is not reported as somebody else's push and the next read
    // validates against the new commit. Remounting here used to re-read the
    // open file by branch name straight after the push, which GitHub answers
    // from a cache that has not caught up yet: the file came back missing and
    // the editor showed a blank starter diagram instead.
    host.noteHead(result.commitSha);
    void refresh();
  }

  const doDiscardPreviewLeftovers = () => {
    void run("discardPreview", async () => {
      await discardDrafts(projectId, INTEGRATION_BRANCH);
      await refresh();
    });
  };

  function handleReviewRequested(res: { number: number }) {
    setShowReview(false);
    setReviewRequested(res.number);
    void refresh();
  }

  const statusLabel =
    onMyEdit && locked
      ? t("edit.status.underReview")
      : onEditBranch
        ? t("edit.status.editing")
        : role === "viewer"
          ? t("edit.status.viewer")
          : null;

  return (
    <ProjectPage active="edit" projectId={projectId} state={state} error={error}>
      {state && (
        <>
          {/* One compact row that scrolls horizontally on phones; wraps normally on sm+. */}
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-sm sm:flex-wrap sm:overflow-x-visible [&>*]:shrink-0">
            <div className="flex items-center gap-1.5">
              <BranchChip
                active={branch === INTEGRATION_BRANCH}
                label={t("branch.preview")}
                onClick={() => setBranchParam(INTEGRATION_BRANCH)}
              />
              <BranchChip
                active={branch === PROD_BRANCH}
                label={t("branch.main")}
                onClick={() => setBranchParam(PROD_BRANCH)}
              />
              {myEdit && (
                <BranchChip
                  active={onMyEdit}
                  label={t("edit.myEdit")}
                  dot={Boolean(myEditState?.dirty)}
                  locked={Boolean(myEditState?.openPrNumber)}
                  onClick={doBackToEdit}
                />
              )}
              {branchKindOf(branch) === "other" && (
                <BranchChip active label={branchLabel(branch, t)} onClick={() => {}} />
              )}
            </div>
            {statusLabel && <Badge>{statusLabel}</Badge>}
            <div className="mx-1 h-5 w-px bg-neutral-300" />

            {role !== "viewer" &&
              (!onMyEdit ? (
                myEdit ? (
                  <Action onClick={doBackToEdit} disabled={busy !== null}>
                    <Pencil size={14} /> {t("edit.backToEdit")}
                  </Action>
                ) : (
                  <Action onClick={doStartEdit} disabled={busy !== null}>
                    <Plus size={14} /> {t("edit.startEditing")}
                  </Action>
                )
              ) : locked ? (
                <Link
                  href={`/projects/${projectId}/pulls`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-sm text-amber-800 hover:border-amber-400"
                >
                  <Lock size={14} />
                  {t("edit.underReview", { n: String(branchState?.openPrNumber ?? "") })}
                </Link>
              ) : (
                <>
                  <Action
                    onClick={() => setShowPush(true)}
                    disabled={!hasUnpushed || autosavePending}
                  >
                    <Upload size={14} /> {t("edit.push")}
                  </Action>
                  <Action onClick={() => setShowReview(true)} disabled={autosavePending}>
                    <GitPullRequest size={14} /> {t("edit.requestReview")}
                  </Action>
                  {legacyCount > 0 && (
                    <Action onClick={() => setShowConvert(true)} disabled={autosavePending}>
                      <FileText size={14} /> {t("convert.action")}
                    </Action>
                  )}
                  <Action onClick={() => setShowSpelling(true)} disabled={autosavePending}>
                    <FileText size={14} /> {t("spelling.action")}
                  </Action>
                  <button
                    onClick={() => setShowDiscard(true)}
                    className="whitespace-nowrap text-xs text-neutral-400 hover:text-red-600 hover:underline"
                  >
                    {t("edit.discard")}
                  </button>
                </>
              ))}

            {markdownFile && !mobile && (
              <Action onClick={() => setDocPref(!docView)}>
                {docView ? (
                  <>
                    <LayoutList size={14} /> {t("md.diagram")}
                  </>
                ) : (
                  <>
                    <FileText size={14} /> {t("md.document")}
                  </>
                )}
              </Action>
            )}

            <Action onClick={toggleView}>
              {mobile ? (
                <>
                  <Monitor size={14} /> {t("edit.editor")}
                </>
              ) : (
                <>
                  <Smartphone size={14} /> {t("edit.mobile")}
                </>
              )}
            </Action>
            <span className="ml-auto inline-flex items-center gap-2 text-xs text-neutral-500">
              {busy && <RefreshCw size={12} className="animate-spin" />}
              <b>{t(`nav.role.${role}`)}</b>
            </span>
          </div>

          {notice && (
            <div className="flex shrink-0 items-center justify-between border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              <span>{notice}</span>
              <button onClick={() => setNotice(null)} className="text-xs underline">
                {t("close")}
              </button>
            </div>
          )}

          {reviewRequested !== null && (
            <div className="flex shrink-0 items-center justify-between border-b border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
              <span>{t("edit.review.requested", { n: String(reviewRequested) })}</span>
              <div className="flex items-center gap-3">
                <Link href={`/projects/${projectId}/pulls`} className="text-xs underline">
                  {t("nav.pulls")}
                </Link>
                <button onClick={() => setReviewRequested(null)} className="text-xs underline">
                  {t("close")}
                </button>
              </div>
            </div>
          )}

          {headMoved && (
            <div className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              <span>{t("edit.branchMoved")}</span>
              <button
                onClick={() => {
                  setHeadMoved(null);
                  void refresh();
                  setReload((r) => r + 1);
                }}
                className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500"
              >
                <RefreshCw size={13} /> {t("edit.reload")}
              </button>
            </div>
          )}

          {readOnly && (
            <div className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              <span className="inline-flex items-center gap-1.5">
                <Lock size={14} /> {t("edit.readonly", { reason: lockReason ?? "" })}
              </span>
            </div>
          )}

          {previewLeftovers && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
              <span>{t("edit.previewDrafts")}</span>
              {role === "owner" && (
                <button
                  onClick={doDiscardPreviewLeftovers}
                  disabled={busy !== null}
                  className="shrink-0 text-xs text-neutral-500 underline hover:text-red-600 disabled:opacity-50"
                >
                  {t("edit.previewDrafts.discard")}
                </button>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1">
            {!ready ? null : mobile ? (
              mobileFiles ? (
                <MobileView
                  files={mobileFiles}
                  editable={!readOnly}
                  onSave={(p, d) => {
                    setMobileFiles((f) => ({ ...(f ?? {}), [p]: d }));
                    void saveDrafts(projectId, branch, [{ id: p, dsl: d }])
                      .then(() => setLocalDirty(true))
                      .catch((e) => setNotice(describeError(e, t)));
                  }}
                  onRename={async (from, to) => {
                    const res = await renameFile(projectId, branch, from, to);
                    // The server may have normalised the destination (into the
                    // diagrams root, or across .txt/.md); follow what it did.
                    setMobileFiles((f) => {
                      if (!f || f[from] === undefined) return f;
                      const { [from]: text, ...rest } = f;
                      return { ...rest, [res.to]: text };
                    });
                    setLocalDirty(true);
                    setMFile(res.to);
                  }}
                  path={mFile}
                  onPath={setMFile}
                  onPathNotFound={() => setNotice(t("edit.fileNotFound"))}
                  editStep={mStep}
                  onEditStep={setMStep}
                  readImport={host.readImport}
                  readAsset={host.readAsset}
                />
              ) : (
                <LoadingFallback />
              )
            ) : docView && mFile ? (
              <DocumentView
                host={host}
                path={mFile}
                readOnly={readOnly}
                onSaved={() => setLocalDirty(true)}
                onError={setNotice}
                onPending={setAutosavePending}
              />
            ) : (
              <DslEditor
                key={`${branch}:${reload}`}
                host={host}
                projectId={projectId}
                options={{
                  lang,
                  showLanguageToggle: false,
                  diagramDefaults: state?.settings.diagram,
                  initialDocumentId: mFile,
                  onActiveDocument: setMFile,
                  onDocumentNotFound: () => setNotice(t("edit.fileNotFound")),
                  autosaveDelayMs: 1500,
                  localMirrorKey: mirrorScope,
                  onPendingChange: setAutosavePending,
                  onAutosaveError: setNotice,
                }}
              />
            )}
          </div>

          {showPrompt && <MobilePrompt onMobile={chooseMobile} onStay={stayEditor} />}

          {showPush && (
            <PushModal
              projectId={projectId}
              branch={branch}
              headSha={branchState?.sha}
              onClose={() => setShowPush(false)}
              onPushed={handlePushed}
            />
          )}
          {showReview && (
            <RequestReviewModal
              projectId={projectId}
              branch={branch}
              onClose={() => setShowReview(false)}
              onRequested={handleReviewRequested}
            />
          )}
          {showSpelling && (
            <MigrateSpellingsModal
              projectId={projectId}
              branch={branch}
              onClose={() => setShowSpelling(false)}
              onMigrated={({ updated, lines }) => {
                setShowSpelling(false);
                setNotice(
                  updated
                    ? t("spelling.done", { files: String(updated), lines: String(lines) })
                    : t("spelling.none"),
                );
                if (updated) {
                  setMobileFiles(null);
                  setReload((n) => n + 1);
                }
              }}
            />
          )}
          {showConvert && (
            <ConvertMarkdownModal
              projectId={projectId}
              branch={branch}
              count={legacyCount}
              onClose={() => setShowConvert(false)}
              onConverted={({ converted }) => {
                setShowConvert(false);
                setNotice(t("convert.done", { n: String(converted) }));
                // Every path in the tree changed, so nothing cached about it
                // is still true: refetch rather than patch.
                setMFile(undefined);
                setMobileFiles(null);
                setReload((n) => n + 1);
              }}
            />
          )}
          {showDiscard && (
            <DiscardEditModal
              busy={busy === "discard"}
              onClose={() => setShowDiscard(false)}
              onConfirm={doDiscard}
            />
          )}
        </>
      )}
    </ProjectPage>
  );
}
