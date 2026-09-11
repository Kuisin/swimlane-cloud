"use client";

import { useState } from "react";
import { branchKindOf, branchLabel } from "@/lib/branch-label";
import { publishVersion, unpublishVersion } from "@/lib/workflow";
import {
  ProjectPage,
  HistoryPanel,
  Modal,
  ModalFooter,
  describeError,
  useProject,
} from "../_components";
import type { VersionState } from "@/lib/types";
import { useT } from "@/i18n";

export default function BranchesPage() {
  const { projectId, state, refresh, error } = useProject();
  const { t } = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState<VersionState | null>(null);
  const [busy, setBusy] = useState(false);

  const branches = state?.branches ?? [];
  const view =
    selected && branches.some((b) => b.name === selected) ? selected : (branches[0]?.name ?? "");
  const isOwner = state?.me.role === "owner";

  return (
    <ProjectPage active="branches" projectId={projectId} state={state} error={error ?? notice}>
      {state && (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto grid max-w-4xl gap-6 p-6 md:grid-cols-[240px_1fr]">
            <div>
              <h2 className="mb-2 text-sm font-semibold text-neutral-700">{t("branches.title")}</h2>
              <ul className="space-y-1">
                {branches.map((b) => (
                  <li key={b.name}>
                    <button
                      onClick={() => setSelected(b.name)}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                        view === b.name
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-neutral-200 hover:border-neutral-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {branchLabel(b.name, t)}
                          {b.locked ? " 🔒" : ""}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-neutral-400">
                          {b.sha.slice(0, 7)}
                        </span>
                      </div>
                      {branchKindOf(b.name) !== "other" && (
                        <div className="truncate font-mono text-[10px] text-neutral-400">
                          {b.name}
                        </div>
                      )}
                      {b.message && (
                        <div className="truncate text-xs text-neutral-500">{b.message}</div>
                      )}
                      {(b.dirty || b.editSession) && (
                        <div className="mt-0.5 flex gap-1 text-[10px]">
                          {b.dirty && (
                            <span className="rounded bg-amber-100 px-1 text-amber-700">
                              {t("edit.unsaved")}
                            </span>
                          )}
                          {b.editSession?.createdBy && (
                            <span className="rounded bg-neutral-100 px-1 text-neutral-500">
                              {b.editSession.createdBy}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold text-neutral-700">
                {t("branches.historyOf", { branch: branchLabel(view, t) })}
              </h2>
              {view && (
                <HistoryPanel
                  projectId={projectId}
                  state={state}
                  branch={view}
                  onTogglePublish={
                    view === "main" && isOwner ? (version) => setConfirmPublish(version) : undefined
                  }
                />
              )}
            </div>
          </div>
        </div>
      )}

      {confirmPublish && (
        <Modal
          title={confirmPublish.public ? t("branches.unshare") : t("branches.share")}
          onClose={() => setConfirmPublish(null)}
          maxW="max-w-sm"
          footer={
            <ModalFooter
              onCancel={() => setConfirmPublish(null)}
              onConfirm={() => {
                const version = confirmPublish;
                const action = version.public
                  ? unpublishVersion(projectId, version.id)
                  : publishVersion(projectId, version.id, "svg_only");
                setBusy(true);
                action
                  .then(() => refresh())
                  .catch((e) => setNotice(describeError(e, t)))
                  .finally(() => {
                    setBusy(false);
                    setConfirmPublish(null);
                  });
              }}
              confirmLabel={confirmPublish.public ? t("branches.unshare") : t("branches.share")}
              busy={busy}
            />
          }
        >
          <p className="text-sm text-neutral-600">
            {confirmPublish.public ? t("branches.confirmUnshare") : t("branches.confirmShare")}
          </p>
        </Modal>
      )}
    </ProjectPage>
  );
}
