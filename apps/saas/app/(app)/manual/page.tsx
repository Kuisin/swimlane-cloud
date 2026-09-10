"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { MarkdownView } from "@/components/markdown-view";
import { api, ApiClientError, redirectToReconnect } from "@/lib/client";
import { MANUAL_SECTIONS, isManualSlug, type ManualSlug } from "@/lib/manual";
import { useT } from "@/i18n";

const DEFAULT_SLUG: ManualSlug = "overview";

function LoadingFallback() {
  const { t } = useT();
  return <div className="p-6 text-sm text-neutral-500">{t("loading")}</div>;
}

export default function ManualPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ManualPageInner />
    </Suspense>
  );
}

function ManualPageInner() {
  const { t, lang } = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const requested = sp.get("section");
  const slug: ManualSlug = requested && isManualSlug(requested) ? requested : DEFAULT_SLUG;

  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    api<{ text: string }>(`/api/manual/${lang}/${slug}`)
      .then((res) => {
        if (!cancelled) setText(res.text);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiClientError && e.needsAuth) {
          redirectToReconnect(e);
          return;
        }
        setError(t("manual.notFound"));
      });
    return () => {
      cancelled = true;
    };
  }, [lang, slug, t]);

  function select(next: ManualSlug) {
    setNavOpen(false);
    router.push(`/manual?section=${next}`, { scroll: false });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        {/* A tab strip would work for eleven items on a phone, but only just —
            a collapsible list keeps the table of contents legible instead of
            wrapping across several lines. */}
        <button
          onClick={() => setNavOpen((v) => !v)}
          className="flex items-center gap-2 self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 lg:hidden"
        >
          {navOpen ? <X size={15} /> : <Menu size={15} />}
          {t("manual.sections")}
        </button>
        <nav
          className={`w-full shrink-0 lg:block lg:w-56 ${navOpen ? "block" : "hidden"}`}
          aria-label={t("manual.sections")}
        >
          <ul className="space-y-0.5">
            {MANUAL_SECTIONS.map((s) => (
              <li key={s}>
                <button
                  onClick={() => select(s)}
                  className={`block w-full rounded-md px-2.5 py-1.5 text-left text-sm ${
                    s === slug
                      ? "bg-indigo-50 font-medium text-indigo-700"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {t(`manual.section.${s}`)}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 pb-10">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : text === null ? (
            <p className="text-sm text-neutral-400">{t("loading")}</p>
          ) : (
            <MarkdownView text={text} />
          )}
        </main>
      </div>
    </div>
  );
}
