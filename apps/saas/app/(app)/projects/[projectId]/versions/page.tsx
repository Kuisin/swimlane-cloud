"use client";

import { useState } from "react";
import { Tag } from "lucide-react";
import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { promoteVersion, publishVersion, unpublishVersion } from "@/lib/workflow";
import { ProjectPage, VersionPanel, describeError, useProject } from "../_components";
import { PromoteModal, PublishModal } from "./_modals";
import type { VersionState } from "@/lib/types";
import { useT } from "@/i18n";

export default function VersionsPage() {
  const { projectId, state, refresh, error } = useProject();
  const { t } = useT();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [promoting, setPromoting] = useState<VersionState | null>(null);

  const isOwner = state?.me.role === "owner";
  const preview = state?.branches.find((b) => b.name === INTEGRATION_BRANCH);

  const run = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);
    fn()
      .then(() => refresh())
      .catch((e) => setNotice(describeError(e, t)))
      .finally(() => setBusy(false));
  };

  return (
    <ProjectPage active="versions" projectId={projectId} state={state} error={error ?? notice}>
      {state && (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-4xl p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t("versions.title")}</h2>
                <p className="text-xs text-neutral-500">
                  {t("versions.description")}
                  {preview?.dirty ? ` ${t("versions.previewDirty")}` : ""}
                </p>
              </div>
              {isOwner ? (
                <button
                  onClick={() => setShowPublish(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  <Tag size={15} /> {t("versions.publish")}
                </button>
              ) : (
                <span className="text-xs text-neutral-400">{t("versions.ownerHint")}</span>
              )}
            </div>
            <VersionPanel
              projectId={projectId}
              state={state}
              isOwner={isOwner}
              onPromote={(v) => setPromoting(v)}
              onPublish={(v, shareMode) => run(() => publishVersion(projectId, v.id, shareMode))}
              onUnpublish={(v) => run(() => unpublishVersion(projectId, v.id))}
            />
          </div>
        </div>
      )}
      {showPublish && (
        <PublishModal
          projectId={projectId}
          existingNames={state?.versions.map((v) => v.name) ?? []}
          onClose={() => setShowPublish(false)}
          onPublished={(res) => {
            setShowPublish(false);
            if (res.renderFailures.length) {
              setNotice(t("versions.renderFailures", { files: res.renderFailures.join(", ") }));
            }
            void refresh();
          }}
        />
      )}
      {promoting && (
        <PromoteModal
          name={promoting.name}
          busy={busy}
          onClose={() => setPromoting(null)}
          onConfirm={() => {
            const v = promoting;
            setPromoting(null);
            run(() => promoteVersion(projectId, v.id));
          }}
        />
      )}
    </ProjectPage>
  );
}
