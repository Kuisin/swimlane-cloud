"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GitHubMark } from "@/components/github-mark";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useT, LanguageToggle } from "@/i18n";

/** Same-origin paths only, so `next` cannot be turned into an open redirect. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const { t } = useT();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const errorCode = params.get("error");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        // `repo` is what lets the app read and commit diagrams in private
        // repositories the user already has access to.
        options: { scopes: "repo", redirectTo },
      });
      if (error) throw error;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">{t("login.title")}</h1>
        <p className="text-sm text-neutral-500">{t("login.subtitle")}</p>
      </div>

      {errorCode ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`login.error.${errorCode}`) === `login.error.${errorCode}`
            ? t("login.error.auth")
            : t(`login.error.${errorCode}`)}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
      >
        <GitHubMark className="h-4 w-4" />
        {busy ? t("login.redirecting") : t("login.github")}
      </button>

      <p className="text-center text-xs text-neutral-500">{t("login.scopeNote")}</p>

      <div className="flex justify-center">
        <LanguageToggle />
      </div>
    </main>
  );
}
