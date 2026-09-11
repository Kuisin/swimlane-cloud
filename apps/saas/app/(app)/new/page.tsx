"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { api, ApiClientError, postJson, redirectToReconnect } from "@/lib/client";
import { useT } from "@/i18n";

interface Owner {
  login: string;
  type: "user" | "org";
  avatarUrl: string;
}
interface Candidate {
  owner: string;
  repo: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string | null;
}

export default function NewProjectPage() {
  const { t } = useT();
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "mark">("create");
  const [owners, setOwners] = useState<Owner[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [owner, setOwner] = useState<string>("");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ owners: Owner[] }>("/api/github/owners")
      .then((r) => {
        setOwners(r.owners);
        setOwner((o) => o || r.owners[0]?.login || "");
      })
      .catch((e) => {
        if (e instanceof ApiClientError && e.needsAuth) return redirectToReconnect(e);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useEffect(() => {
    if (tab !== "mark" || candidates) return;
    api<{ repos: Candidate[] }>("/api/github/repos")
      .then((r) => setCandidates(r.repos))
      .catch((e) => {
        if (e instanceof ApiClientError && e.needsAuth) return redirectToReconnect(e);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [tab, candidates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (candidates ?? []).filter((c) => !q || c.fullName.toLowerCase().includes(q));
  }, [candidates, search]);

  async function submit(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await postJson<{ projectId: string }>("/api/projects", body);
      router.push(`/projects/${res.projectId}`);
    } catch (e) {
      if (e instanceof ApiClientError && e.needsAuth) return redirectToReconnect(e);
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  const selectedOwner = owners?.find((o) => o.login === owner);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">
          {t("nav.dashboard")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("new.title")}</h1>

        <div className="mt-6 flex gap-1 rounded-md border border-neutral-200 p-1 text-sm">
          {(["create", "mark"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`flex-1 rounded px-3 py-1.5 ${
                tab === k ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {t(`new.${k}`)}
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
              if (!selectedOwner || !name.trim()) return;
              void submit(
                { mode: "create", owner: selectedOwner.login, ownerType: selectedOwner.type, name },
                "create",
              );
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("new.owner")}</span>
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                disabled={!owners}
              >
                {(owners ?? []).map((o) => (
                  <option key={o.login} value={o.login}>
                    {o.login} {o.type === "org" ? `(${t("dashboard.org")})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("new.name")}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="process-diagrams"
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
                required
              />
            </label>
            <p className="text-xs text-neutral-500">{t("new.createHint")}</p>
            <button
              type="submit"
              disabled={busy === "create" || !owners}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy === "create" ? t("new.creating") : t("new.createButton")}
            </button>
          </form>
        ) : (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-neutral-500">{t("new.markHint")}</p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("new.search")}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            {!candidates ? (
              <p className="text-sm text-neutral-500">{t("loading")}</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-neutral-500">{t("new.noRepos")}</p>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-neutral-200 overflow-y-auto rounded-lg border border-neutral-200">
                {filtered.map((c) => (
                  <li key={c.fullName} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {c.fullName}
                        {c.private ? <Lock size={11} className="text-neutral-400" /> : null}
                      </p>
                      {c.description ? (
                        <p className="truncate text-xs text-neutral-500">{c.description}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={busy === c.fullName}
                      onClick={() =>
                        void submit({ mode: "mark", owner: c.owner, repo: c.repo }, c.fullName)
                      }
                      className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50 disabled:opacity-60"
                    >
                      {busy === c.fullName ? t("loading") : t("new.markButton")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </>
  );
}
