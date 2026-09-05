"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { useT } from "@/i18n";

const PLANS = [
  { key: "free", projects: "3" },
  { key: "team", projects: "50" },
  { key: "enterprise", projects: "∞" },
] as const;

/**
 * Billing is deferred: this page states the limits the API already enforces
 * (`src/lib/plans.ts`) and where Stripe Checkout will go. The webhook that
 * updates `workspaces.plan` exists; nothing here can charge anyone yet.
 */
export default function BillingPage() {
  const params = useParams();
  const { t } = useT();
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">
          {t("nav.dashboard")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("billing.title")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("billing.description")}</p>
        <p className="mt-1 font-mono text-xs text-neutral-400">{String(params.workspaceId)}</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => (
            <li key={p.key} className="rounded-lg border border-neutral-200 p-4">
              <p className="font-semibold capitalize">{p.key}</p>
              <p className="mt-1 text-sm text-neutral-600">
                {t("billing.projectsPerOwner", { n: p.projects })}
              </p>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled
          className="mt-6 rounded-md bg-neutral-300 px-4 py-2 text-sm font-semibold text-white"
        >
          {t("billing.upgradeSoon")}
        </button>
      </main>
    </>
  );
}
