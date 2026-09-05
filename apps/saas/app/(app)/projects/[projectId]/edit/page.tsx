"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, GitPullRequest, Lock, Monitor, Plus, RefreshCw, Smartphone } from "lucide-react";
import { clearLocalMirror, DslEditor } from "@swimlane-cloud/editor";
import "@swimlane-cloud/editor/styles.css";
import { INTEGRATION_BRANCH, isEditBranch } from "@swimlane-cloud/github-client";
import { createSaasHost } from "@/lib/saas-host";
import {
  branchOf,
  canEditBranch,
  checkpoint,
  defaultBranch,
  editLockReason,
  getSnapshot,
  isLocked,
  openPR,
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
  const [mStep, setMStep] = useState<number | null>(null);
  const [mobileFiles, setMobileFiles] = useState<Files | null>(null);
  const [localDirty, setLocalDirty] = useState(false);
  const [autosavePending, setAutosavePending] = useState(false);
  const [headMoved, setHeadMoved] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const restored = useRef(false);
  // Gates the editor/mobile content until URL state is restored, so the editor
  // doesn't auto-open the first file before `?file=` is applied.
  const [ready, setReady] = useState(false);

  const branch = state ? defaultBranch(state, branchParam) : INTEGRATION_BRANCH;
  const branchState = state ? branchOf(state, branch) : undefined;
  const role = state?.me.role ?? "viewer";
  const onMain = branch === "main";
  const editable = state ? canEditBranch(state, branch) : false;
  const readOnly = !editable;
  const mirrorScope = `${projectId}:${branch}`;

  const host = useMemo(
    () =>
      createSaasHost({
        projectId,
        branch,
        editable,
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
    if (f) setMFile(f);
    const s = sp.get("step");
    if (s != null && s !== "") {
      const n = Number(s);
      if (!Number.isNaN(n)) setMStep(n);
    }
    setReady(true);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!restored.current) return;
    const params = new URLSearchParams(sp.toString());
    params.set("branch", branch);
    params.set("view", mobile ? "mobile" : "editor");
    if (mFile) params.set("file", mFile);
    else params.delete("file");
    if (mStep != null) params.set("step", String(mStep));
    else params.delete("step");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [branch, mobile, mFile, mStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switching branch resets per-branch UI state.
  useEffect(() => {
    setHeadMoved(null);
    setLocalDirty(false);
    setMobileFiles(null);
  }, [branch]);

  const dirty = autosavePending || localDirty || Boolean(branchState?.dirty);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

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
    const name = window.prompt(t("edit.prompt.startEdit"), t("edit.prompt.startEditDefault"));
    if (!name) return;
    void run("start", async () => {
      const res = await startEdit(projectId, name);
      await refresh();
      setBranchParam(res.branch);
      setReload((r) => r + 1);
    });
  };

  const doCheckpoint = () => {
    const msg = window.prompt(t("edit.prompt.checkpoint"), t("edit.prompt.checkpointDefault"));
    if (msg === null) return;
    void run("checkpoint", async () => {
      await checkpoint(projectId, branch, msg, undefined, branchState?.sha);
      setLocalDirty(false);
      setHeadMoved(null);
      await refresh();
      setReload((r) => r + 1);
    });
  };

  const onTmp = isEditBranch(branch);
  const locked = state ? isLocked(state, branch) : false;
  const lockReasonKey = state ? editLockReason(state, branch) : null;
  const lockReason = lockReasonKey ? t(`edit.lock.${lockReasonKey}`) : null;
  const canOpenPR = onTmp && !locked && role !== "viewer";

  const doOpenPR = () => {
    if (!state || !canOpenPR) return;
    const title = window.prompt(
      t("edit.prompt.prTitle"),
      t("edit.prompt.prTitleDefault", { branch, prBase: INTEGRATION_BRANCH }),
    );
    if (title === null) return;
    void run("pr", async () => {
      const res = await openPR(projectId, state, branch, title);
      await refresh();
      window.alert(t("edit.prompt.prOpened", { branch, base: res.base }));
    });
  };

  const statusLabel = onMain
    ? t("edit.status.production")
    : locked
      ? t("edit.status.locked")
      : branch === INTEGRATION_BRANCH
        ? editable
          ? t("edit.status.integration")
          : t("edit.status.integrationReadonly")
        : role === "viewer"
          ? t("edit.status.viewer")
          : t("edit.status.editBranch");

  return (
    <ProjectPage active="edit" projectId={projectId} state={state} error={error}>
      {state && (
        <>
          {/* One compact row that scrolls horizontally on phones; wraps normally on sm+. */}
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-sm sm:flex-wrap sm:overflow-x-visible [&>*]:shrink-0">
            <select
              value={branch}
              onChange={(e) => setBranchParam(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1"
            >
              {state.branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                  {b.locked ? " 🔒" : ""}
                  {b.dirty ? " •" : ""}
                </option>
              ))}
            </select>
            <Badge>{statusLabel}</Badge>
            <div className="mx-1 h-5 w-px bg-neutral-300" />
            <Action onClick={doStartEdit} disabled={role === "viewer" || busy !== null}>
              <Plus size={14} /> {t("edit.startEdit")}
            </Action>
            <Action
              onClick={doCheckpoint}
              disabled={readOnly || busy !== null}
              title={lockReason ?? undefined}
            >
              <Check size={14} /> {t("edit.checkpoint")}
            </Action>
            <Action
              onClick={doOpenPR}
              disabled={!canOpenPR || busy !== null}
              title={
                !onTmp
                  ? t("edit.prompt.openPrHint")
                  : locked
                    ? t("edit.prompt.prAlreadyOpen")
                    : undefined
              }
            >
              <GitPullRequest size={14} /> {t("edit.openPrTo", { base: INTEGRATION_BRANCH })}
            </Action>
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
              {dirty && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                  {t("edit.unsaved")}
                </span>
              )}
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
              {!onMain && !locked && role !== "viewer" && (
                <button
                  onClick={doStartEdit}
                  className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500"
                >
                  <Plus size={13} /> {t("edit.startEditBranch")}
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
                  path={mFile}
                  onPath={setMFile}
                  editStep={mStep}
                  onEditStep={setMStep}
                />
              ) : (
                <LoadingFallback />
              )
            ) : (
              <DslEditor
                key={`${branch}:${reload}`}
                host={host}
                projectId={projectId}
                options={{
                  lang,
                  showLanguageToggle: false,
                  initialDocumentId: mFile,
                  onActiveDocument: setMFile,
                  autosaveDelayMs: 1500,
                  localMirrorKey: mirrorScope,
                  onPendingChange: setAutosavePending,
                  onAutosaveError: setNotice,
                }}
              />
            )}
          </div>

          {showPrompt && <MobilePrompt onMobile={chooseMobile} onStay={stayEditor} />}
        </>
      )}
    </ProjectPage>
  );
}
