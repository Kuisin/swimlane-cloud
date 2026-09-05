"use client";

import { useState } from "react";
import { closePR, mergePR } from "@/lib/workflow";
import { ProjectPage, PrPanel, describeError, useProject } from "../_components";
import { useT } from "@/i18n";

export default function PullsPage() {
  const { projectId, state, refresh, error } = useProject();
  const { t } = useT();
  const [notice, setNotice] = useState<string | null>(null);

  const isOwner = state?.me.role === "owner";

  return (
    <ProjectPage active="pulls" projectId={projectId} state={state} error={error ?? notice}>
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
              onMerge={(pr) => {
                const into = t("pulls.confirmMergeInto", { base: pr.base });
                if (!window.confirm(t("pulls.confirmMerge", { into }))) return;
                setNotice(null);
                mergePR(projectId, pr.number, pr.headSha || undefined)
                  .then(() => refresh())
                  .catch((e) => setNotice(describeError(e, t)));
              }}
              onClose={(pr) => {
                if (!window.confirm(t("pulls.confirmClose"))) return;
                setNotice(null);
                closePR(projectId, pr.number)
                  .then(() => refresh())
                  .catch((e) => setNotice(describeError(e, t)));
              }}
            />
          </div>
        </div>
      )}
    </ProjectPage>
  );
}
