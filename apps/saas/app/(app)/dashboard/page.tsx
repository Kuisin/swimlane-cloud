"use client";

import Link from "next/link";
import { DEMO_PROJECTS } from "@/lib/demo";
import { useT } from "@/i18n";

export default function DashboardPage() {
  const { t } = useT();
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          {t("dashboard.demoMode")}
        </span>
      </div>
      <p className="mb-8 text-sm text-neutral-500">{t("dashboard.description")}</p>

      <ul className="space-y-3">
        {DEMO_PROJECTS.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 p-4"
          >
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-neutral-500">{p.workspace}</p>
            </div>
            <Link
              href={`/projects/${p.id}`}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              {t("dashboard.open")}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
