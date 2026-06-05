"use client";

import { flagVersion, promote, publishVersion, unpublishVersion } from "@/lib/demo-workflow";
import { ProjectNav, VersionPanel, useProject } from "../_components";

export default function VersionsPage() {
  const { projectId, projectName, st, setSt, setRole, reset } = useProject();

  if (!st) return <div className="p-6 text-sm text-neutral-500">Loading…</div>;

  const isManager = st.role === "manager";

  const doFlag = () => {
    const name = window.prompt("Version name (snapshots the current test branch):", "");
    if (!name) return;
    const note = window.prompt("Note (optional):", "") ?? "";
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
              <h2 className="text-lg font-semibold">Versions</h2>
              <p className="text-xs text-neutral-500">
                Flagged from the <span className="font-mono">test</span> branch; promote to{" "}
                <span className="font-mono">main</span> to ship.
              </p>
            </div>
            {isManager ? (
              <button
                onClick={doFlag}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                🏷 Flag new version
              </button>
            ) : (
              <span className="text-xs text-neutral-400">Switch to Manager to flag a version</span>
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
