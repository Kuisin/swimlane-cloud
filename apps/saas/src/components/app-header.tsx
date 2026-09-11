"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { GitHubMark } from "@/components/github-mark";
import { useT, LanguageToggle } from "@/i18n";
import { localCache } from "@/lib/local-cache";

/** Top bar for the account-level pages (dashboard, new project). */
export function AppHeader({ login, right }: { login?: string | null; right?: React.ReactNode }) {
  const { t } = useT();
  return (
    <header className="border-b border-neutral-200">
      {/*
        `min-h` rather than a fixed height, and allowed to wrap: a page that
        adds its own actions here (the dashboard adds two) needs about 307px on
        the right alone, which does not fit beside the title on a 320px screen.
        Wrapping drops the actions onto a second line instead of pushing the
        whole page sideways.
      */}
      <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
        <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
          Swimlane Cloud
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          {right}
          <Link
            href="/manual"
            className="hidden items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 sm:flex"
          >
            <BookOpen size={14} />
            {t("nav.manual")}
          </Link>
          <LanguageToggle />
          {login ? (
            <span className="hidden items-center gap-1.5 text-xs text-neutral-600 sm:flex">
              <GitHubMark className="h-3.5 w-3.5" />
              {login}
            </span>
          ) : null}
          <form action="/api/auth/signout" method="post" onSubmit={() => localCache.clear()}>
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
