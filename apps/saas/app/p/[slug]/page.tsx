import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getGitea } from "@/lib/gitea";
import { getRepoCoords } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public share page (plan Step 2.4). No auth. Fetches the version by
 * public_slug, renders the stored SVG, and shows read-only DSL when
 * share_mode === 'svg_and_dsl'.
 */
export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let svg: string | null = null;
  let dsl: string | null = null;
  let name = "";
  let shareMode: string | null = null;

  try {
    const supabase = getServiceSupabase();
    const { data: version } = await supabase
      .from("versions")
      .select(
        "id, name, commit_sha, share_mode, public, diagram_id, svg_blobs(svg_storage_path)",
      )
      .eq("public_slug", slug)
      .eq("public", true)
      .maybeSingle();

    if (!version) notFound();
    name = version.name as string;
    shareMode = version.share_mode as string | null;

    // Fetch the stored SVG from S3 (public read).
    const blob = (version as { svg_blobs?: { svg_storage_path?: string } })
      .svg_blobs;
    if (blob?.svg_storage_path) {
      const region = process.env.AWS_REGION ?? "us-east-1";
      const bucket = process.env.S3_SVG_BUCKET ?? "";
      const url = `https://${bucket}.s3.${region}.amazonaws.com/${blob.svg_storage_path}`;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) svg = await res.text();
      } catch {
        /* fall through */
      }
    }

    if (shareMode === "svg_and_dsl") {
      const { data: diagram } = await supabase
        .from("diagrams")
        .select("project_id, filepath_in_repo")
        .eq("id", version.diagram_id as string)
        .single();
      if (diagram) {
        const { org, repo } = await getRepoCoords(diagram.project_id as string);
        const gitea = getGitea();
        dsl = await gitea.readFileText(
          org,
          repo,
          diagram.filepath_in_repo as string,
          version.commit_sha as string,
        );
      }
    }
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold">{name}</h1>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        {svg ? (
          // Stored, server-rendered SVG — safe content authored by the project.
          <div
            className="overflow-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="text-neutral-500">Diagram preview is unavailable.</p>
        )}
      </section>

      {shareMode === "svg_and_dsl" && dsl && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-medium text-neutral-700">DSL source</h2>
          <pre className="overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs">
            {dsl}
          </pre>
        </section>
      )}

      <footer className="mt-10 text-xs text-neutral-400">
        Shared via Swimlane Cloud — read only.
      </footer>
    </main>
  );
}
