"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DslEditor } from "@swimlane-cloud/editor";
import "@swimlane-cloud/editor/styles.css";
import {
  loadState,
  setRole,
  setActiveBranch,
  startEdit,
  checkpoint,
  openPR,
  mergePR,
  flagVersion,
  promote,
  resetDemo,
  createWorkflowHost,
  tipFiles,
  type WorkflowState,
  type Role,
} from "@/lib/demo-workflow";

type Tab = "history" | "prs" | "versions";

export default function WorkflowShell({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [st, setSt] = useState<WorkflowState | null>(null);
  const [tab, setTab] = useState<Tab>("history");
  const [reload, setReload] = useState(0);
  const [reviewPR, setReviewPR] = useState<string | null>(null);

  useEffect(() => {
    setSt(loadState(projectId));
  }, [projectId]);

  // All hooks must run unconditionally (before any early return), so derive the
  // active branch with a safe fallback while state is still loading.
  const branch = st?.activeBranch ?? "test";
  const onMain = branch === "main";
  const host = useMemo(
    () => createWorkflowHost(projectId, branch, onMain),
    [projectId, branch, onMain, reload],
  );

  if (!st) return <div className="p-6 text-sm text-neutral-500">Loading…</div>;

  const isManager = st.role === "manager";
  const onTmp = branch.startsWith("tmp-");
  const branchNames = Object.keys(st.branches).sort((a, b) => {
    const order = (n: string) => (n === "main" ? 0 : n === "test" ? 1 : 2);
    return order(a) - order(b) || a.localeCompare(b);
  });

  const apply = (next: WorkflowState) => setSt(next);
  const bump = () => setReload((r) => r + 1);

  const doStartEdit = () => {
    const name = window.prompt("Name this edit (creates a tmp-* branch from test):", "tweak");
    if (!name) return;
    apply(startEdit(projectId, st, name));
    bump();
  };
  const doCheckpoint = () => {
    const msg = window.prompt("Checkpoint message:", "Update diagram");
    if (msg === null) return;
    apply(checkpoint(projectId, st, branch, msg));
  };
  const doOpenPR = () => {
    const title = window.prompt("Pull request title:", `Merge ${branch} into test`);
    if (title === null) return;
    apply(openPR(projectId, st, branch, title));
    setTab("prs");
  };
  const doFlagVersion = () => {
    const name = window.prompt("Version name (flagged on test, renders SVG):", "");
    if (!name) return;
    const note = window.prompt("Note (optional):", "") ?? "";
    apply(flagVersion(projectId, st, name, note));
    setTab("versions");
  };
  const doMerge = (id: string) => {
    apply(mergePR(projectId, st, id));
    setReviewPR(null);
    bump();
  };
  const doPromote = (id: string) => {
    apply(promote(projectId, st, id));
    bump();
  };
  const doReset = () => {
    if (!window.confirm("Reset this demo project (branches, PRs, versions, edits)?")) return;
    resetDemo(projectId);
    setSt(loadState(projectId));
    bump();
  };

  return (
    <div className="flex h-screen flex-col">
      {/* top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-base font-semibold">{projectName}</h1>
        </div>
        <div className="flex items-center gap-4">
          <RoleSwitch role={st.role} onChange={(r) => apply(setRole(projectId, st, r))} />
          <button onClick={doReset} className="text-xs text-neutral-400 hover:text-neutral-600">
            Reset demo
          </button>
        </div>
      </header>

      {/* action bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm">
        <span className="text-neutral-500">Branch</span>
        <select
          value={branch}
          onChange={(e) => apply(setActiveBranch(projectId, st, e.target.value))}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1"
        >
          {branchNames.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <Badge>{onMain ? "production · read-only" : onTmp ? "edit branch" : "integration"}</Badge>

        <div className="mx-2 h-5 w-px bg-neutral-300" />

        <Action onClick={doStartEdit}>＋ Start edit</Action>
        {!onMain && <Action onClick={doCheckpoint}>✓ Checkpoint</Action>}
        {onTmp && <Action onClick={doOpenPR}>⇧ Open pull request → test</Action>}
        {branch === "test" && <Action onClick={doFlagVersion}>🏷 Flag new version</Action>}

        <div className="ml-auto text-xs text-neutral-500">
          You are: <b>{st.role === "manager" ? "Manager" : "Member"}</b>
          {st.role === "member" && " (merge & promote need a Manager)"}
        </div>
      </div>

      {/* body: editor + side panel */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 border-r border-neutral-200">
          <DslEditor key={`${branch}:${reload}`} host={host} />
        </div>
        <aside className="flex w-[360px] shrink-0 flex-col">
          <div className="flex shrink-0 border-b border-neutral-200 text-sm">
            {(["history", "prs", "versions"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 px-3 py-2 ${
                  tab === t
                    ? "border-b-2 border-indigo-600 font-medium text-indigo-600"
                    : "text-neutral-500"
                }`}
              >
                {t === "history" ? "History" : t === "prs" ? `PRs (${st.prs.filter((p) => p.status === "open").length})` : `Versions (${st.versions.length})`}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
            {tab === "history" && <HistoryPanel st={st} branch={branch} />}
            {tab === "prs" && (
              <PrPanel
                st={st}
                isManager={isManager}
                reviewPR={reviewPR}
                onReview={(id) => setReviewPR(reviewPR === id ? null : id)}
                onMerge={doMerge}
              />
            )}
            {tab === "versions" && (
              <VersionPanel st={st} isManager={isManager} onPromote={doPromote} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function RoleSwitch({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
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

function Action({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 hover:border-indigo-400 hover:text-indigo-600"
    >
      {children}
    </button>
  );
}
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">
      {children}
    </span>
  );
}

function HistoryPanel({ st, branch }: { st: WorkflowState; branch: string }) {
  const commits = [...(st.branches[branch]?.commits ?? [])].reverse();
  if (commits.length === 0) return <Empty>No commits.</Empty>;
  return (
    <ol className="space-y-2">
      {commits.map((c, i) => (
        <li key={c.id} className="rounded-md border border-neutral-200 p-2">
          <div className="font-medium">{c.message}</div>
          <div className="text-xs text-neutral-500">
            {c.author} · {new Date(c.ts).toLocaleString()}
            {i === 0 && <span className="ml-2 rounded bg-green-100 px-1 text-green-700">tip</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function PrPanel({
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
    return <Empty>No pull requests. On a tmp-* branch, click “Open pull request”.</Empty>;
  return (
    <ul className="space-y-3">
      {st.prs.map((pr) => {
        const head = st.branches[pr.head];
        const base = st.branches[pr.base];
        const headFiles = tipFiles(head);
        const baseFiles = tipFiles(base);
        const changed = Object.keys({ ...headFiles, ...baseFiles }).filter(
          (p) => (headFiles[p] ?? "") !== (baseFiles[p] ?? ""),
        );
        return (
          <li key={pr.id} className="rounded-md border border-neutral-200 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{pr.title}</div>
                <div className="text-xs text-neutral-500">
                  {pr.head} → {pr.base} · {pr.author}
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
                <button onClick={() => onReview(pr.id)} className="text-xs text-indigo-600 hover:underline">
                  {reviewPR === pr.id ? "Hide diff" : `Review (${changed.length} file${changed.length === 1 ? "" : "s"})`}
                </button>
                <div className="ml-auto">
                  {isManager ? (
                    <button
                      onClick={() => onMerge(pr.id)}
                      className="rounded bg-purple-600 px-2 py-1 text-xs font-medium text-white hover:bg-purple-500"
                    >
                      Merge
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-400" title="Switch to Manager to merge">
                      Manager merges
                    </span>
                  )}
                </div>
              </div>
            )}
            {reviewPR === pr.id && (
              <div className="mt-2 space-y-2">
                {changed.length === 0 && <Empty>No differences.</Empty>}
                {changed.map((p) => (
                  <Diff key={p} path={p} before={baseFiles[p] ?? ""} after={headFiles[p] ?? ""} />
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
  const rows = [];
  for (let i = 0; i < max; i++) {
    const l = a[i] ?? "";
    const r = b[i] ?? "";
    rows.push({ l, r, changed: l !== r });
  }
  return (
    <div className="rounded border border-neutral-200">
      <div className="border-b border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-xs">{path}</div>
      <div className="grid grid-cols-2 font-mono text-[10px] leading-relaxed">
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

function VersionPanel({
  st,
  isManager,
  onPromote,
}: {
  st: WorkflowState;
  isManager: boolean;
  onPromote: (id: string) => void;
}) {
  if (st.versions.length === 0)
    return <Empty>No versions. On the test branch, click “Flag new version”.</Empty>;
  return (
    <ul className="space-y-3">
      {st.versions.map((v) => (
        <li key={v.id} className="rounded-md border border-neutral-200 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium">{v.name}</div>
              {v.note && <div className="truncate text-xs text-neutral-500">{v.note}</div>}
              <div className="text-xs text-neutral-400">{new Date(v.ts).toLocaleString()}</div>
            </div>
            {v.promoted ? (
              <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                on main
              </span>
            ) : isManager ? (
              <button
                onClick={() => onPromote(v.id)}
                className="shrink-0 rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500"
              >
                Promote → main
              </button>
            ) : (
              <span className="shrink-0 text-xs text-neutral-400">Manager promotes</span>
            )}
          </div>
          {v.svg && (
            <div
              className="mt-2 max-h-40 overflow-auto rounded border border-neutral-100 bg-white p-1 [&_svg]:h-auto [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: v.svg }}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-4 text-center text-xs text-neutral-400">{children}</p>;
}
