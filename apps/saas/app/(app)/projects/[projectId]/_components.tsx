"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  loadState,
  setRole as setRoleAction,
  resetDemo,
  tipFiles,
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
  if (commits.length === 0) return <Empty>No commits on this branch.</Empty>;
  return (
    <ol className="space-y-2">
      {commits.map((c, i) => (
        <li key={c.id} className="rounded-md border border-neutral-200 p-3">
          <div className="font-medium">{c.message}</div>
          <div className="text-xs text-neutral-500">
            {c.author} · {new Date(c.ts).toLocaleString()}
            {i === 0 && (
              <span className="ml-2 rounded bg-green-100 px-1 text-green-700">tip</span>
            )}
          </div>
        </li>
      ))}
    </ol>
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
}: {
  st: WorkflowState;
  isManager: boolean;
  onPromote: (id: string) => void;
}) {
  if (st.versions.length === 0)
    return <Empty>No versions yet. A Manager flags one from the test branch above.</Empty>;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {st.versions.map((v) => (
        <li key={v.id} className="rounded-md border border-neutral-200 p-3">
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
                className="shrink-0 rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
              >
                Promote → main
              </button>
            ) : (
              <span className="shrink-0 text-xs text-neutral-400">Manager promotes</span>
            )}
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
