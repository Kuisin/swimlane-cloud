"use client";

import { useState } from "react";
import { RefreshCw, Tag } from "lucide-react";
import { flagVersion, promoteVersion, publishVersion, unpublishVersion } from "@/lib/workflow";
import { ProjectPage, VersionPanel, describeError, useProject } from "../_components";
import { useT } from "@/i18n";

export default function VersionsPage() {
  const { projectId, state, refresh, error } = useProject();
  const { t } = useT();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isOwner = state?.me.role === "owner";
  const test = state?.branches.find((b) => b.name === "test");

  const run = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);
    fn()
      .then(() => refresh())
      .catch((e) => setNotice(describeError(e, t)))
      .finally(() => setBusy(false));
  };

  const doFlag = () => {
    const name = window.prompt(t("versions.prompt.name"), "");
    if (!name) return;
    const note = window.prompt(t("versions.prompt.note"), "") ?? "";
    run(async () => {
      const res = await flagVersion(projectId, name, note || undefined);
      if (res.renderFailures.length) {
        window.alert(t("versions.renderFailures", { files: res.renderFailures.join(", ") }));
      }
    });
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
                  {test?.dirty ? ` ${t("versions.testDirty")}` : ""}
                </p>
              </div>
              {isOwner ? (
                <button
                  onClick={doFlag}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  {busy ? <RefreshCw size={15} className="animate-spin" /> : <Tag size={15} />}{" "}
                  {t("versions.flagNew")}
                </button>
              ) : (
                <span className="text-xs text-neutral-400">{t("versions.ownerHint")}</span>
              )}
            </div>
            <VersionPanel
              projectId={projectId}
              state={state}
              isOwner={isOwner}
              onPromote={(v) => {
                if (!window.confirm(t("versions.confirmPromote", { name: v.name }))) return;
                run(() => promoteVersion(projectId, v.id));
              }}
              onPublish={(v, shareMode) => run(() => publishVersion(projectId, v.id, shareMode))}
              onUnpublish={(v) => run(() => unpublishVersion(projectId, v.id))}
            />
          </div>
        </div>
      )}
    </ProjectPage>
  );
}
