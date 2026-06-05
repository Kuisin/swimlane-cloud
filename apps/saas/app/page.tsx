"use client";

import Link from "next/link";
import { useT } from "@/i18n";

export default function LandingPage() {
  const { t } = useT();
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-widest text-indigo-600">
          {t("landing.tagline")}
        </p>
        <h1 className="text-4xl font-bold tracking-tight">{t("landing.headline")}</h1>
        <p className="text-lg text-neutral-600">{t("landing.description")}</p>
      </header>

      <div className="flex flex-wrap gap-4">
        <Link
          href="/dashboard"
          className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          {t("landing.openDashboard")}
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          {t("landing.signIn")}
        </Link>
      </div>

      <ul className="grid gap-3 text-sm text-neutral-600 sm:grid-cols-2">
        <li className="rounded-lg border border-neutral-200 p-4">
          <span className="font-semibold text-neutral-900">{t("landing.feature.draft")}</span>
          <br />
          {t("landing.feature.draftDesc")}
        </li>
        <li className="rounded-lg border border-neutral-200 p-4">
          <span className="font-semibold text-neutral-900">{t("landing.feature.versions")}</span>
          <br />
          {t("landing.feature.versionsDesc")}
        </li>
        <li className="rounded-lg border border-neutral-200 p-4">
          <span className="font-semibold text-neutral-900">{t("landing.feature.promote")}</span>
          <br />
          {t("landing.feature.promoteDesc")}
        </li>
        <li className="rounded-lg border border-neutral-200 p-4">
          <span className="font-semibold text-neutral-900">{t("landing.feature.share")}</span>
          <br />
          {t("landing.feature.shareDesc")}
        </li>
      </ul>
    </main>
  );
}
