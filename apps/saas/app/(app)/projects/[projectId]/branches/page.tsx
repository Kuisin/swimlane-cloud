"use client";

import { useState } from "react";
import { tipFiles } from "@/lib/demo-workflow";
import { ProjectNav, HistoryPanel, useProject } from "../_components";

export default function BranchesPage() {
  const { projectId, projectName, st, setRole, reset } = useProject();
  const [selected, setSelected] = useState<string | null>(null);

  if (!st) return <div className="p-6 text-sm text-neutral-500">Loading…</div>;

  const branchNames = Object.keys(st.branches).sort((a, b) => {
    const ord = (n: string) => (n === "main" ? 0 : n === "test" ? 1 : 2);
    return ord(a) - ord(b) || a.localeCompare(b);
  });
  const view = selected && st.branches[selected] ? selected : branchNames[0];

  return (
    <div className="flex h-screen flex-col">
      <ProjectNav
        projectId={projectId}
        projectName={projectName}
        active="branches"
        role={st.role}
        onRole={setRole}
        onReset={reset}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto grid max-w-4xl gap-6 p-6 md:grid-cols-[220px_1fr]">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-neutral-700">Branches</h2>
            <ul className="space-y-1">
              {branchNames.map((b) => {
                const tip = st.branches[b].commits.at(-1);
                const fileCount = Object.keys(tipFiles(st.branches[b])).length;
                return (
                  <li key={b}>
                    <button
                      onClick={() => setSelected(b)}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                        view === b
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-neutral-200 hover:border-neutral-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono">{b}</span>
                        <span className="text-xs text-neutral-400">
                          {st.branches[b].commits.length}c · {fileCount}f
                        </span>
                      </div>
                      {tip && (
                        <div className="truncate text-xs text-neutral-500">{tip.message}</div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-neutral-700">
              History · <span className="font-mono">{view}</span>
            </h2>
            <HistoryPanel st={st} branch={view} />
          </div>
        </div>
      </div>
    </div>
  );
}
