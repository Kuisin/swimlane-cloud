"use client";

import { RefreshCw } from "lucide-react";
import { useT } from "@/i18n";

/**
 * Next.js route-segment `loading.tsx` fallback: shown the instant a
 * navigation starts, filling the gap before the target segment's async
 * server work (e.g. `projects/[projectId]/layout.tsx`'s permission check, or
 * `p/[slug]/page.tsx`'s Supabase query) has resolved. Without one, that gap
 * renders nothing at all — the target page's own "Loading…" text can't
 * appear until the server work ahead of it finishes.
 */
export function RouteLoading() {
  const { t } = useT();
  return (
    <div className="flex h-screen items-center justify-center gap-2 text-sm text-neutral-500">
      <RefreshCw size={16} className="animate-spin" />
      {t("loading")}
    </div>
  );
}
