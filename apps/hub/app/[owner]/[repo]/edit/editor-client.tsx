"use client";

import { useMemo, useState } from "react";
import { DslEditor } from "@swimlane-cloud/editor";
import "@swimlane-cloud/editor/styles.css";
import { createGitHubHost } from "@/lib/github-host";

/**
 * The editor mounted over a GitHub branch.
 *
 * Note this passes no `dialogs`: in a normal browser the package's
 * window.alert/confirm/prompt defaults are exactly right. The prop exists for
 * shells where those are unavailable — a VS Code webview — and omitting it here
 * is what keeps that default path exercised.
 */
export function EditorClient({
  owner,
  repo,
  branch,
}: {
  owner: string;
  repo: string;
  branch: string;
}) {
  const [staleSince, setStaleSince] = useState<string | null>(null);

  const host = useMemo(
    () =>
      createGitHubHost({
        owner,
        repo,
        branch,
        onHeadChange: (sha) => setStaleSince((prev) => prev ?? sha),
      }),
    [owner, repo, branch],
  );

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-neutral-200 px-3 py-2 text-sm">
        <a href={`/${owner}/${repo}`} className="font-medium hover:underline">
          {owner}/{repo}
        </a>
        <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs text-blue-700">
          {branch}
        </span>
        {staleSince ? (
          <span className="text-xs text-amber-700">
            This branch moved on GitHub — a checkpoint will be refused until you reload.
          </span>
        ) : null}
        <form action="/api/auth/logout" method="post" className="ml-auto">
          <button type="submit" className="text-xs text-neutral-500 hover:underline">
            Sign out
          </button>
        </form>
      </header>
      <div className="min-h-0 flex-1">
        <DslEditor host={host} projectId={`${owner}/${repo}`} />
      </div>
    </div>
  );
}
