"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { ProjectPage, Empty, describeError, useProject } from "../_components";
import { useT } from "@/i18n";

interface Entry {
  id: string;
  actor: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  commitSha: string | null;
  createdAt: string;
}

export default function ActivityPage() {
  const { projectId, state, error } = useProject();
  const { t } = useT();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api<{ entries: Entry[] }>(`/api/projects/${projectId}/activity?limit=100`)
      .then((r) => setEntries(r.entries))
      .catch((e) => setNotice(describeError(e, t)));
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ProjectPage active="activity" projectId={projectId} state={state} error={error ?? notice}>
      {state && (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl p-6">
            <h2 className="mb-1 text-lg font-semibold">{t("activity.title")}</h2>
            <p className="mb-4 text-xs text-neutral-500">{t("activity.description")}</p>
            {!entries ? (
              <Empty>{t("loading")}</Empty>
            ) : entries.length === 0 ? (
              <Empty>{t("activity.empty")}</Empty>
            ) : (
              <ol className="divide-y divide-neutral-200 rounded-md border border-neutral-200">
                {entries.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{e.actor ?? "—"}</span>{" "}
                      <span className="text-neutral-600">{t(`activity.action.${e.action}`)}</span>
                      {e.entityId && (
                        <span className="ml-1 font-mono text-xs text-neutral-500">
                          {e.entityId}
                        </span>
                      )}
                      {e.commitSha && (
                        <a
                          href={`${state.project.htmlUrl}/commit/${e.commitSha}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 font-mono text-xs text-neutral-400 hover:underline"
                        >
                          {e.commitSha.slice(0, 7)}
                        </a>
                      )}
                    </div>
                    <time className="shrink-0 text-xs text-neutral-400">
                      {new Date(e.createdAt).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </ProjectPage>
  );
}
