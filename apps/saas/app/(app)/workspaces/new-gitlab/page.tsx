"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { api, ApiClientError, postJson, redirectToReconnect } from "@/lib/client";
import { useT } from "@/i18n";

interface Namespace {
  id: number;
  path: string;
  fullPath: string;
  name: string;
}

interface DiscoveredProject {
  owner: string;
  repo: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string | null;
  projectId: string | null;
}

/**
 * The GitLab connect wizard: register an org's instance -> OAuth round trip
 * (a full-page redirect out to the instance and back) -> claim a workspace
 * by picking a GitLab group -> create or attach the first project. Each step
 * is a URL state (`step`/`instanceId`/`workspaceId`) rather than local-only
 * state, since step 2 is a real navigation away from this page and back.
 */
export default function NewGitLabWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <Wizard />
    </Suspense>
  );
}

function Wizard() {
  const { t } = useT();
  const params = useSearchParams();
  const step = params.get("step") ?? "register";
  const instanceId = params.get("instanceId");
  const workspaceId = params.get("workspaceId");

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">
          {t("nav.dashboard")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("gitlab.wizardTitle")}</h1>

        {step === "claim" && instanceId ? (
          <ClaimStep instanceId={instanceId} />
        ) : step === "project" && workspaceId ? (
          <ProjectStep workspaceId={workspaceId} />
        ) : (
          <RegisterStep />
        )}
      </main>
    </>
  );
}

function RegisterStep() {
  const { t } = useT();
  const [host, setHost] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { instanceId } = await postJson<{ instanceId: string }>("/api/gitlab/instances", {
        host,
        displayName,
        clientId,
        clientSecret,
      });
      window.location.assign(
        `/api/gitlab/connect?instanceId=${encodeURIComponent(instanceId)}&next=${encodeURIComponent(
          `/workspaces/new-gitlab?step=claim&instanceId=${instanceId}`,
        )}`,
      );
    } catch (e) {
      if (e instanceof ApiClientError && e.needsAuth) return redirectToReconnect(e);
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <p className="text-sm text-neutral-500">{t("gitlab.registerHint")}</p>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t("gitlab.host")}</span>
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder={t("gitlab.hostPlaceholder")}
          className="w-full rounded-md border border-neutral-300 px-3 py-2"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t("gitlab.displayName")}</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t("gitlab.clientId")}</span>
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{t("gitlab.clientSecret")}</span>
        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs"
          required
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {busy ? t("gitlab.registering") : t("gitlab.registerButton")}
      </button>
    </form>
  );
}

function ClaimStep({ instanceId }: { instanceId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [namespaces, setNamespaces] = useState<Namespace[] | null>(null);
  const [namespacePath, setNamespacePath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ namespaces: Namespace[] }>(`/api/gitlab/namespaces?instanceId=${instanceId}`)
      .then((r) => {
        setNamespaces(r.namespaces);
        setNamespacePath((p) => p || r.namespaces[0]?.fullPath || "");
      })
      .catch((e) => {
        if (e instanceof ApiClientError && e.needsAuth) return redirectToReconnect(e);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [instanceId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!namespacePath) return;
    setBusy(true);
    setError(null);
    try {
      const { workspaceId } = await postJson<{ workspaceId: string }>(
        `/api/gitlab/instances/${instanceId}/claim`,
        { namespacePath },
      );
      router.push(`/workspaces/new-gitlab?step=project&workspaceId=${workspaceId}`);
    } catch (e) {
      if (e instanceof ApiClientError && e.needsAuth) return redirectToReconnect(e);
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <p className="text-sm text-neutral-500">{t("gitlab.claimHint")}</p>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {!namespaces ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : namespaces.length === 0 ? (
        <p className="text-sm text-neutral-500">{t("gitlab.noNamespaces")}</p>
      ) : (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t("gitlab.namespace")}</span>
          <select
            value={namespacePath}
            onChange={(e) => setNamespacePath(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          >
            {namespaces.map((n) => (
              <option key={n.fullPath} value={n.fullPath}>
                {n.fullPath}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="submit"
        disabled={busy || !namespacePath}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {busy ? t("gitlab.claiming") : t("gitlab.claimButton")}
      </button>
    </form>
  );
}

function ProjectStep({ workspaceId }: { workspaceId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "mark">("create");
  const [candidates, setCandidates] = useState<DiscoveredProject[] | null>(null);
  const [name, setName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "mark" || candidates) return;
    api<{ repos: DiscoveredProject[] }>(`/api/gitlab/projects?workspaceId=${workspaceId}`)
      .then((r) => setCandidates(r.repos))
      .catch((e) => {
        if (e instanceof ApiClientError && e.needsAuth) return redirectToReconnect(e);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [tab, candidates, workspaceId]);

  async function submit(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await postJson<{ projectId: string }>("/api/gitlab/projects", {
        workspaceId,
        ...body,
      });
      router.push(`/projects/${res.projectId}`);
    } catch (e) {
      if (e instanceof ApiClientError && e.needsAuth) return redirectToReconnect(e);
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <div className="mt-6">
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {t("gitlab.workspaceConnected")}
      </p>
      <h2 className="mt-6 text-lg font-semibold">{t("gitlab.projectStepTitle")}</h2>

      <div className="mt-4 flex gap-1 rounded-md border border-neutral-200 p-1 text-sm">
        {(["create", "mark"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`flex-1 rounded px-3 py-1.5 ${
              tab === k ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {t(k === "create" ? "gitlab.createProject" : "gitlab.attachProject")}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {tab === "create" ? (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void submit({ mode: "create", name }, "create");
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("gitlab.projectName")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="process-diagrams"
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
              required
            />
          </label>
          <p className="text-xs text-neutral-500">{t("gitlab.createProjectHint")}</p>
          <button
            type="submit"
            disabled={busy === "create"}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy === "create" ? t("new.creating") : t("gitlab.createProjectButton")}
          </button>
        </form>
      ) : (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-neutral-500">{t("gitlab.attachProjectHint")}</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!projectPath.trim()) return;
              void submit({ mode: "mark", projectPath }, "attach");
            }}
          >
            <input
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder={t("gitlab.projectPath")}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy === "attach" || !projectPath.trim()}
              className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50 disabled:opacity-60"
            >
              {busy === "attach" ? t("loading") : t("gitlab.attachProjectButton")}
            </button>
          </form>
          {!candidates ? (
            <p className="text-sm text-neutral-500">{t("loading")}</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-neutral-500">{t("new.noRepos")}</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-neutral-200 overflow-y-auto rounded-lg border border-neutral-200">
              {candidates.map((c) => (
                <li key={c.fullName} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.fullName}</p>
                    {c.description ? (
                      <p className="truncate text-xs text-neutral-500">{c.description}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={busy === c.fullName}
                    onClick={() =>
                      void submit({ mode: "mark", projectPath: c.fullName }, c.fullName)
                    }
                    className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50 disabled:opacity-60"
                  >
                    {busy === c.fullName ? t("loading") : t("gitlab.attachProjectButton")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
