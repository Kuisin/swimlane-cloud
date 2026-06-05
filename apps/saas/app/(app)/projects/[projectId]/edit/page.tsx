"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, GitPullRequest, Lock, Monitor, Plus, Smartphone } from "lucide-react";
import { DslEditor } from "@swimlane-cloud/editor";
import "@swimlane-cloud/editor/styles.css";
import {
  setActiveBranch,
  startEdit,
  checkpoint,
  openPR,
  isBranchDirty,
  createWorkflowHost,
  canEditBranch,
  isLocked,
  editLockReason,
  getWorking,
} from "@/lib/demo-workflow";
import {
  ProjectNav,
  Action,
  Badge,
  MobileView,
  MobilePrompt,
  isMobileDevice,
  useProject,
} from "../_components";

const VIEW_PREF = "sw-view-mode";

export default function EditPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading…</div>}>
      <EditPageInner />
    </Suspense>
  );
}

function EditPageInner() {
  const { projectId, projectName, st, setSt, setRole, reset } = useProject();
  const router = useRouter();
  const sp = useSearchParams();

  const [reload, setReload] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  // Mobile open-file + editing-block, persisted to the URL so reloads restore.
  const [mFile, setMFile] = useState<string | undefined>(undefined);
  const [mStep, setMStep] = useState<number | null>(null);
  const restored = useRef(false);

  const role = st?.role ?? "member";
  const branch = st && st.branches[st.activeBranch] ? st.activeBranch : "test";
  const onMain = branch === "main";
  const readOnly = st ? !canEditBranch(st, branch, role) : true;
  const host = useMemo(
    () => createWorkflowHost(projectId, branch, readOnly),
    [projectId, branch, readOnly, reload],
  );

  // Restore state from the URL once the workflow state has loaded.
  useEffect(() => {
    if (!st || restored.current) return;
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
    if (b && st.branches[b] && b !== st.activeBranch) setSt(setActiveBranch(projectId, st, b));
    const f = sp.get("file");
    if (f) setMFile(f);
    const s = sp.get("step");
    if (s != null && s !== "") {
      const n = Number(s);
      if (!Number.isNaN(n)) setMStep(n);
    }
  }, [st]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the URL in sync with branch / view / open file / editing block.
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

  // Warn before leaving/reloading with uncommitted changes on the active branch.
  const dirty = st ? isBranchDirty(projectId, st, branch) : false;
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

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

  if (!st) return <div className="p-6 text-sm text-neutral-500">Loading…</div>;

  const onTmp = branch.startsWith("tmp-");
  const locked = isLocked(st, branch);
  const lockReason = editLockReason(st, branch, role);
  const branchNames = Object.keys(st.branches).sort((a, b) => {
    const ord = (n: string) => (n === "main" ? 0 : n === "test" ? 1 : 2);
    return ord(a) - ord(b) || a.localeCompare(b);
  });

  const doStartEdit = () => {
    const name = window.prompt("Name this edit (creates a tmp-* branch from test):", "tweak");
    if (!name) return;
    setSt(startEdit(projectId, st, name));
    setReload((r) => r + 1);
  };
  const doCheckpoint = () => {
    const msg = window.prompt("Checkpoint message:", "Update diagram");
    if (msg === null) return;
    setSt(checkpoint(projectId, st, branch, msg));
  };
  const prBase = onTmp ? "test" : branch === "test" ? "main" : null;
  const canOpenPR = prBase !== null && !locked;
  const doOpenPR = () => {
    if (!prBase) return;
    const title = window.prompt("Pull request title:", `Merge ${branch} into ${prBase}`);
    if (title === null) return;
    setSt(openPR(projectId, st, branch, title));
    window.alert(`Pull request opened (${branch} → ${prBase}). A Manager reviews and merges it.`);
  };

  const statusLabel = onMain
    ? "production · read-only"
    : locked
      ? "locked · PR open"
      : branch === "test"
        ? role === "manager"
          ? "integration"
          : "integration · read-only"
        : "edit branch";

  return (
    <div className="flex h-screen flex-col">
      <ProjectNav
        projectId={projectId}
        projectName={projectName}
        active="edit"
        role={st.role}
        onRole={setRole}
        onReset={reset}
      />

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
        <select
          value={branch}
          onChange={(e) => setSt(setActiveBranch(projectId, st, e.target.value))}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1"
        >
          {branchNames.map((b) => (
            <option key={b} value={b}>
              {b}
              {isLocked(st, b) ? " 🔒" : ""}
            </option>
          ))}
        </select>
        <Badge>{statusLabel}</Badge>
        <div className="mx-1 h-5 w-px bg-neutral-300" />
        <Action onClick={doStartEdit}>
          <Plus size={14} /> Start edit
        </Action>
        <Action onClick={doCheckpoint} disabled={readOnly} title={lockReason ?? undefined}>
          <Check size={14} /> Checkpoint
        </Action>
        <Action
          onClick={doOpenPR}
          disabled={!canOpenPR}
          title={
            prBase === null
              ? "Open a PR from a tmp-* branch (→ test) or from test (→ main)"
              : locked
                ? "A pull request is already open for this branch"
                : undefined
          }
        >
          <GitPullRequest size={14} /> {prBase ? `Open PR → ${prBase}` : "Open PR"}
        </Action>
        <Action onClick={toggleView}>
          {mobile ? (
            <>
              <Monitor size={14} /> Editor
            </>
          ) : (
            <>
              <Smartphone size={14} /> Mobile
            </>
          )}
        </Action>
        <span className="ml-auto inline-flex items-center gap-2 text-xs text-neutral-500">
          {dirty && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">unsaved</span>}
          <b>{role === "manager" ? "Manager" : "Member"}</b>
        </span>
      </div>

      {readOnly && (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span className="inline-flex items-center gap-1.5">
            <Lock size={14} /> Read-only: {lockReason}.
          </span>
          {!onMain && !locked && (
            <button
              onClick={doStartEdit}
              className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500"
            >
              <Plus size={13} /> Start an edit branch
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {mobile ? (
          <MobileView
            files={getWorking(projectId, branch)}
            editable={!readOnly}
            onSave={(p, d) => host.writeDraft(p, d)}
            path={mFile}
            onPath={setMFile}
            editStep={mStep}
            onEditStep={setMStep}
          />
        ) : (
          <DslEditor key={`${branch}:${reload}`} host={host} />
        )}
      </div>

      {showPrompt && <MobilePrompt onMobile={chooseMobile} onStay={stayEditor} />}
    </div>
  );
}
