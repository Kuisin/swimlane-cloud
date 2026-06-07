"use client";

import { Tag } from "lucide-react";
import { flagVersion, promote, publishVersion, unpublishVersion } from "@/lib/demo-workflow";
import { ProjectNav, VersionPanel, useProject } from "../_components";
import { useT } from "@/i18n";

export default function VersionsPage() {
  const { projectId, projectName, st, setSt, setRole, reset } = useProject();
  const { t } = useT();

  if (!st) return <div className="p-6 text-sm text-neutral-500">{t("loading")}</div>;

  const isManager = st.role === "manager";

  const doFlag = () => {
    const name = window.prompt(t("versions.prompt.name"), "");
    if (!name) return;
    const note = window.prompt(t("versions.prompt.note"), "") ?? "";
    setSt(flagVersion(projectId, st, name, note));
  };

  return (
    <div className="flex h-screen flex-col">
      <ProjectNav
        projectId={projectId}
        projectName={projectName}
        active="versions"
        role={st.role}
        onRole={setRole}
        onReset={reset}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("versions.title")}</h2>
              <p className="text-xs text-neutral-500">{t("versions.description")}</p>
            </div>
            {isManager ? (
              <button
                onClick={doFlag}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                <Tag size={15} /> {t("versions.flagNew")}
              </button>
            ) : (
              <span className="text-xs text-neutral-400">{t("versions.managerHint")}</span>
            )}
          </div>
          <VersionPanel
            st={st}
            isManager={isManager}
            onPromote={(id) => setSt(promote(projectId, st, id))}
            onPublish={(id) => setSt(publishVersion(projectId, st, id))}
            onUnpublish={(id) => setSt(unpublishVersion(projectId, st, id))}
          />
        </div>
      </div>
    </div>
  );
}
