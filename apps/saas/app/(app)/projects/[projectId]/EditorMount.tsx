"use client";

import { useMemo, useState } from "react";
import { createSaasHost } from "@/lib/saas-host";
// The shared editor is built concurrently by another agent. It is imported in
// exactly ONE place (here) so the rest of the app typechecks/builds even if the
// editor package's entry is not yet resolvable. See README "Known limitations".
import { DslEditor } from "@swimlane-cloud/editor";
import "@swimlane-cloud/editor/styles.css";

const BRANCH_PRESETS = ["main", "test"];

export default function EditorMount({
  projectId,
  tmpBranches,
}: {
  projectId: string;
  tmpBranches: string[];
}) {
  const [branch, setBranch] = useState("test");

  const host = useMemo(
    () => createSaasHost({ projectId, branch }),
    [projectId, branch],
  );

  const branches = [...BRANCH_PRESETS, ...tmpBranches];

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-2">
        <label className="text-sm text-neutral-600">Branch</label>
        <select
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
        >
          {branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1">
        {/* Re-key on branch so the editor reloads the tree for the active ref. */}
        <DslEditor key={branch} host={host} projectId={projectId} />
      </div>
    </div>
  );
}
