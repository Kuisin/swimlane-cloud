import { ApiError, json, withApi } from "@/lib/api";
import { isManualLang, isManualSlug } from "@/lib/manual";
import { readManualSection } from "@/lib/manual-fs";
import { requireUser } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/manual/[lang]/[slug] — one manual section's Markdown.
 *
 * A route handler rather than a server component because the language is a
 * client-only preference (`sw-app-lang` in localStorage, `i18n.tsx`) with no
 * server-visible cookie — the manual page already knows `lang` via `useT()`
 * and fetches with it, the same way every other client-rendered page here
 * talks to its API.
 *
 * Behind the same sign-in check as the rest of the app, not because the
 * content is sensitive, but because nothing here is served to a signed-out
 * visitor.
 */
export const GET = withApi(
  async (_req, ctx: { params: Promise<{ lang: string; slug: string }> }) => {
    await requireUser();
    const { lang, slug } = await ctx.params;
    if (!isManualLang(lang) || !isManualSlug(slug)) {
      throw new ApiError(404, "No such manual section.");
    }
    const text = readManualSection(lang, slug);
    if (text === null) throw new ApiError(404, "No such manual section.");
    return json({ text });
  },
);
