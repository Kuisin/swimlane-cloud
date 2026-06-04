import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getGitea } from "@/lib/gitea";
import { getRepoCoords } from "@/lib/projects";
import { svgPublicUrl } from "@/lib/svg-blobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

interface VersionThumb {
  id: string;
  name: string;
  branch: string;
  promoted: boolean;
  isPublic: boolean;
  thumbUrl: string | null;
}

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { projectId } = await params;
  const { branch: branchParam } = await searchParams;
  const branch = branchParam ?? "test";

  let commits: Commit[] = [];
  let versions: VersionThumb[] = [];
  let error: string | null = null;

  try {
    const { org, repo } = await getRepoCoords(projectId);
    const gitea = getGitea();
    commits = await gitea.listCommits(org, repo, branch, { limit: 30 });

    const supabase = getServiceSupabase();
    const { data: diagrams } = await supabase
      .from("diagrams")
      .select("id")
      .eq("project_id", projectId);
    const diagramIds = (diagrams ?? []).map((d) => d.id as string);
    if (diagramIds.length > 0) {
      const { data: vrows } = await supabase
        .from("versions")
        .select(
          "id, name, branch, promoted_to_main, public, svg_blobs(svg_storage_path)",
        )
        .in("diagram_id", diagramIds)
        .order("created_at", { ascending: false });
      versions = (vrows ?? []).map((v) => {
        const path = (v as { svg_blobs?: { svg_storage_path?: string } })
          .svg_blobs?.svg_storage_path;
        return {
          id: v.id as string,
          name: v.name as string,
          branch: v.branch as string,
          promoted: v.promoted_to_main as boolean,
          isPublic: v.public as boolean,
          thumbUrl: path ? svgPublicUrl(path) : null,
        };
      });
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load history";
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">History</h1>
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-indigo-600 hover:underline"
        >
          ← Back to editor
        </Link>
      </div>

      <div className="mb-6 flex gap-2 text-sm">
        {["test", "main"].map((b) => (
          <Link
            key={b}
            href={`/projects/${projectId}/history?branch=${b}`}
            className={`rounded-md border px-3 py-1 ${
              b === branch
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-neutral-300 text-neutral-600"
            }`}
          >
            {b}
          </Link>
        ))}
      </div>

      {error && (
        <p className="mb-6 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </p>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium text-neutral-700">
            Commits ({branch})
          </h2>
          <ul className="space-y-2">
            {commits.map((c) => (
              <li
                key={c.sha}
                className="rounded-md border border-neutral-200 p-3 text-sm"
              >
                <p className="font-medium">{c.message.split("\n")[0]}</p>
                <p className="text-xs text-neutral-500">
                  {c.author} · {c.sha.slice(0, 8)} ·{" "}
                  {c.date ? new Date(c.date).toLocaleString() : ""}
                </p>
              </li>
            ))}
            {commits.length === 0 && !error && (
              <li className="text-sm text-neutral-400">No commits.</li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-neutral-700">
            Flagged versions
          </h2>
          <ul className="grid grid-cols-2 gap-3">
            {versions.map((v) => (
              <li
                key={v.id}
                className="overflow-hidden rounded-md border border-neutral-200"
              >
                <div className="flex h-28 items-center justify-center bg-neutral-50">
                  {v.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.thumbUrl}
                      alt={v.name}
                      className="max-h-full max-w-full"
                    />
                  ) : (
                    <span className="text-xs text-neutral-400">no preview</span>
                  )}
                </div>
                <div className="p-2 text-xs">
                  <p className="font-medium">{v.name}</p>
                  <p className="text-neutral-500">
                    {v.branch}
                    {v.promoted ? " · main" : ""}
                    {v.isPublic ? " · public" : ""}
                  </p>
                </div>
              </li>
            ))}
            {versions.length === 0 && !error && (
              <li className="col-span-2 text-sm text-neutral-400">
                No flagged versions yet.
              </li>
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
