"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, GitPullRequest, Lock, Monitor, Plus, Smartphone } from "lucide-react";
import { DslEditor } from "@swimlane-cloud/editor";
import "@swimlane-cloud/editor/styles.css";
import {
  setActiveBranch,
  startEdit,
  checkpoint,
  openPR,
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
  const { projectId, projectName, st, setSt, setRole, reset } = useProject();
  const [reload, setReload] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const pref = typeof localStorage !== "undefined" ? localStorage.getItem(VIEW_PREF) : null;
    if (pref === "mobile") setMobile(true);
    else if (pref === "editor") setMobile(false);
    else if (isMobileDevice() && sessionStorage.getItem("sw-mobile-asked") !== "1") {
      setShowPrompt(true);
    }
  }, []);

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

  const role = st?.role ?? "member";
  const branch = st && st.branches[st.activeBranch] ? st.activeBranch : "test";
  const onMain = branch === "main";
  const readOnly = st ? !canEditBranch(st, branch, role) : true;
  const host = useMemo(
    () => createWorkflowHost(projectId, branch, readOnly),
    [projectId, branch, readOnly, reload],
  );

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
  const doOpenPR = () => {
    const title = window.prompt("Pull request title:", `Merge ${branch} into test`);
    if (title === null) return;
    setSt(openPR(projectId, st, branch, title));
    window.alert("Pull request opened. The branch is now locked until a Manager merges it.");
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

      {/* one shared action bar for both the full editor and mobile views */}
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
          disabled={!onTmp || locked}
          title={
            !onTmp
              ? "Open PRs from a tmp-* edit branch"
              : locked
                ? "A pull request is already open for this branch"
                : undefined
          }
        >
          <GitPullRequest size={14} /> Open PR
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
        <span className="ml-auto text-xs text-neutral-500">
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
          />
        ) : (
          <DslEditor key={`${branch}:${reload}`} host={host} />
        )}
      </div>

      {showPrompt && <MobilePrompt onMobile={chooseMobile} onStay={stayEditor} />}
    </div>
  );
}
