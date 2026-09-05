import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { extractTitle, render } from "@/lib/render";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ShareClient, type SharedFile } from "./share-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface PublicVersion {
  name: string;
  note: string | null;
  shareMode: "svg_only" | "svg_and_dsl";
  files: SharedFile[];
}

/**
 * Loads a published version from Postgres only — no GitHub call, no sign-in.
 * SVG is rendered here, server-side; the DSL is sent to the browser only when
 * the owner chose "SVG + DSL", so an `svg_only` link never leaks the source.
 */
async function loadPublic(slug: string): Promise<PublicVersion | null> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("versions")
    .select("name, note, share_mode, version_files(filepath, dsl_text, sort_order)")
    .eq("public_slug", slug)
    .eq("public", true)
    .maybeSingle();
  if (!data) return null;
  const shareMode = (data.share_mode as PublicVersion["shareMode"] | null) ?? "svg_only";
  const rows = (
    (data as { version_files?: { filepath: string; dsl_text: string; sort_order: number }[] })
      .version_files ?? []
  )
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.filepath.localeCompare(b.filepath));
  return {
    name: data.name as string,
    note: (data.note as string | null) ?? null,
    shareMode,
    files: rows.map((f) => ({
      path: f.filepath,
      title: extractTitle(f.dsl_text),
      svg: render(f.dsl_text, "basic").svg,
      dsl: shareMode === "svg_and_dsl" ? f.dsl_text : null,
    })),
  };
}

export default async function PublicSharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const version = await loadPublic(slug);
  if (!version) notFound();
  return (
    <ShareClient
      name={version.name}
      note={version.note}
      shareMode={version.shareMode}
      files={version.files}
    />
  );
}
