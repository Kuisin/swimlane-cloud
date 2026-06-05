"use client";

import { useMemo } from "react";
import { DslEditor } from "@swimlane-cloud/editor";
import "@swimlane-cloud/editor/styles.css";
import { createBrowserHost } from "@/lib/browser-host";
import { demoSeed } from "@/lib/demo";

/**
 * Demo editor mount: runs the shared editor on a localStorage host (no
 * Gitea/Supabase). Diagrams persist in the browser, namespaced by project.
 */
export default function EditorMount({ projectId }: { projectId: string }) {
  const host = useMemo(
    () => createBrowserHost(projectId, demoSeed(projectId)),
    [projectId],
  );

  return (
    <div className="h-[calc(100vh-4rem)]">
      <DslEditor host={host} />
    </div>
  );
}
