"use client";

import { useState } from "react";
import { mergePR, closePR, addPRComment } from "@/lib/demo-workflow";
import { ProjectNav, PrPanel, useProject } from "../_components";

export default function PullsPage() {
  const { projectId, projectName, st, setSt, setRole, reset } = useProject();
  const [reviewPR, setReviewPR] = useState<string | null>(null);

  if (!st) return <div className="p-6 text-sm text-neutral-500">Loading…</div>;

  const isManager = st.role === "manager";

  return (
    <div className="flex h-screen flex-col">
      <ProjectNav
        projectId={projectId}
        projectName={projectName}
        active="pulls"
        role={st.role}
        onRole={setRole}
        onReset={reset}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pull requests</h2>
            <span className="text-xs text-neutral-500">
              {isManager ? "You can merge or close PRs." : "Switch to Manager to merge."}
            </span>
          </div>
          <PrPanel
            st={st}
            isManager={isManager}
            reviewPR={reviewPR}
            onReview={(id) => setReviewPR(reviewPR === id ? null : id)}
            onMerge={(id) => {
              const pr = st.prs.find((p) => p.id === id);
              if (!window.confirm(`Merge this pull request${pr ? ` into ${pr.base}` : ""}?`)) return;
              setSt(mergePR(projectId, st, id));
              setReviewPR(null);
            }}
            onClose={(id) => {
              if (!window.confirm("Close this pull request without merging?")) return;
              setSt(closePR(projectId, st, id));
            }}
            onComment={(id, text) => setSt(addPRComment(projectId, st, id, text))}
          />
        </div>
      </div>
    </div>
  );
}
