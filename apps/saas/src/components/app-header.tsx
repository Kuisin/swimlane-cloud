"use client";

import Link from "next/link";
import { GitHubMark } from "@/components/github-mark";
import { useT, LanguageToggle } from "@/i18n";

/** Top bar for the account-level pages (dashboard, new project). */
export function AppHeader({ login, right }: { login?: string | null; right?: React.ReactNode }) {
  const { t } = useT();
  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
          Swimlane Cloud
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          {right}
          <LanguageToggle />
          {login ? (
            <span className="hidden items-center gap-1.5 text-xs text-neutral-600 sm:flex">
              <GitHubMark className="h-3.5 w-3.5" />
              {login}
            </span>
          ) : null}
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              {t("nav.signOut")}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

export function RoleBadge({ role }: { role: "owner" | "editor" | "viewer" }) {
  const { t } = useT();
  const cls =
    role === "owner"
      ? "bg-indigo-50 text-indigo-700"
      : role === "editor"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-neutral-100 text-neutral-600";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {t(`nav.role.${role}`)}
    </span>
  );
}
