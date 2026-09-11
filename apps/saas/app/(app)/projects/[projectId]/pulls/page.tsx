"use client";

import { useState } from "react";
import { ProjectPage, PrPanel, useProject } from "../_components";
import { ApproveModal, RejectModal } from "./_modals";
import type { PullState } from "@/lib/types";
import { useT } from "@/i18n";

export default function PullsPage() {
  const { projectId, state, refresh, error } = useProject();
  const { t } = useT();
  const [approving, setApproving] = useState<PullState | null>(null);
  const [rejecting, setRejecting] = useState<PullState | null>(null);

  const isOwner = state?.me.role === "owner";

  return (
    <ProjectPage active="pulls" projectId={projectId} state={state} error={error}>
      {state && (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("pulls.title")}</h2>
              <span className="text-xs text-neutral-500">
                {isOwner ? t("pulls.ownerHint") : t("pulls.editorHint")}
              </span>
            </div>
            <PrPanel
              projectId={projectId}
              state={state}
              isOwner={isOwner}
              onMerge={(pr) => setApproving(pr)}
              onClose={(pr) => setRejecting(pr)}
            />
          </div>
        </div>
      )}
      {approving && (
        <ApproveModal
          projectId={projectId}
          pr={approving}
          onClose={() => setApproving(null)}
          onApproved={() => {
            setApproving(null);
            void refresh();
          }}
        />
      )}
      {rejecting && (
        <RejectModal
          projectId={projectId}
          pr={rejecting}
          onClose={() => setRejecting(null)}
          onRejected={() => {
            setRejecting(null);
            void refresh();
          }}
        />
      )}
    </ProjectPage>
  );
}
