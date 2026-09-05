"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Lock, Plus, RefreshCw } from "lucide-react";
import { AppHeader, RoleBadge } from "@/components/app-header";
import { api, ApiClientError, postJson, redirectToLogin } from "@/lib/client";
import { useT } from "@/i18n";

interface DiscoveredRepo {
  owner: string;
  ownerType: "user" | "org";
  repo: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string | null;
  pushedAt: string | null;
  role: "owner" | "editor" | "viewer";
  projectId: string | null;
}

interface ProjectsResponse {
  login: string;
  topic: string;
  repos: DiscoveredRepo[];
}

export default function DashboardPage() {
  const { t } = useT();
  const router = useRouter();
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await api<ProjectsResponse>("/api/github/projects"));
    } catch (e) {
      if (e instanceof ApiClientError && e.needsAuth) return redirectToLogin();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const groups = useMemo(() => {
    const byOwner = new Map<string, DiscoveredRepo[]>();
    for (const r of data?.repos ?? []) {
      const list = byOwner.get(r.owner) ?? [];
      list.push(r);
      byOwner.set(r.owner, list);
    }
    return [...byOwner.entries()];
  }, [data]);

  async function open(repo: DiscoveredRepo) {
    if (repo.projectId) return router.push(`/projects/${repo.projectId}`);
    setOpening(repo.fullName);
    try {
      const res = await postJson<{ projectId: string }>("/api/projects/open", {
        owner: repo.owner,
        repo: repo.repo,
      });
      router.push(`/projects/${res.projectId}`);
    } catch (e) {
      if (e instanceof ApiClientError && e.needsAuth) return redirectToLogin();
      setError(e instanceof Error ? e.message : String(e));
      setOpening(null);
    }
  }

  return (
    <>
      <AppHeader
        login={data?.login}
        right={
          <Link
            href="/new"
            className="flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            <Plus size={14} /> {t("dashboard.newProject")}
          </Link>
        }
      />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {t("dashboard.description", { topic: data?.topic ?? "swimlane" })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1 rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            title={t("dashboard.refresh")}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            {t("dashboard.refresh")}
          </button>
        </div>

        {error ? (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {loading && !data ? (
          <p className="text-sm text-neutral-500">{t("loading")}</p>
        ) : groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
            <p className="font-medium">{t("dashboard.empty")}</p>
            <p className="mt-1 text-sm text-neutral-500">
              {t("dashboard.emptyHint", { topic: data?.topic ?? "swimlane" })}
            </p>
            <Link
              href="/new"
              className="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              {t("dashboard.newProject")}
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map(([owner, repos]) => (
              <section key={owner}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {owner}
                  <span className="ml-2 font-normal normal-case text-neutral-400">
                    {repos[0]?.ownerType === "org" ? t("dashboard.org") : t("dashboard.user")}
                  </span>
                </h2>
                <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
                  {repos.map((r) => (
                    <li key={r.fullName} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">{r.repo}</p>
                          {r.private ? (
                            <span className="flex items-center gap-1 text-[11px] text-neutral-500">
                              <Lock size={11} /> {t("dashboard.private")}
                            </span>
                          ) : null}
                          <RoleBadge role={r.role} />
                        </div>
                        {r.description ? (
                          <p className="mt-0.5 truncate text-xs text-neutral-500">
                            {r.description}
                          </p>
                        ) : null}
                        <a
                          href={r.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-neutral-400 hover:underline"
                        >
                          {r.fullName}
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={() => void open(r)}
                        disabled={opening === r.fullName}
                        className="shrink-0 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                      >
                        {opening === r.fullName ? t("loading") : t("dashboard.open")}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
