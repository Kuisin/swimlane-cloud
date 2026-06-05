"use client";

import { useMemo, useState } from "react";
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
} from "@/lib/demo-workflow";
import { ProjectNav, Action, Badge, useProject } from "../_components";

export default function EditPage() {
  const { projectId, projectName, st, setSt, setRole, reset } = useProject();
  const [reload, setReload] = useState(0);

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
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm">
        <span className="text-neutral-500">Branch</span>
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
        <Action onClick={doStartEdit}>＋ Start edit</Action>
        <Action onClick={doCheckpoint} disabled={readOnly} title={lockReason ?? undefined}>
          ✓ Checkpoint
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
          ⇧ Open pull request → test
        </Action>
        <div className="ml-auto text-xs text-neutral-500">
          <b>{role === "manager" ? "Manager" : "Member"}</b> · Save then Checkpoint to commit
        </div>
      </div>

      {readOnly && (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>🔒 Read-only: {lockReason}.</span>
          {!onMain && !locked && (
            <button
              onClick={doStartEdit}
              className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500"
            >
              ＋ Start an edit branch
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <DslEditor key={`${branch}:${reload}`} host={host} />
      </div>
    </div>
  );
}
