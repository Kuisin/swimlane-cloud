import Link from "next/link";
import EditorMount from "./EditorMount";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ProjectEditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  // Active tmp-* branches for the branch switcher (best-effort).
  let tmpBranches: string[] = [];
  let projectName = "Project";
  try {
    const supabase = getServiceSupabase();
    const { data: project } = await supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .maybeSingle();
    if (project?.name) projectName = project.name as string;

    const { data: edits } = await supabase
      .from("edit_sessions")
      .select("branch_name")
      .eq("project_id", projectId)
      .eq("status", "active");
    tmpBranches = (edits ?? []).map((e) => e.branch_name as string);
  } catch {
    // No env at build / no data yet — render the shell anyway.
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-16 items-center justify-between border-b border-neutral-200 px-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold">{projectName}</h1>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link
            href={`/projects/${projectId}/history`}
            className="text-neutral-600 hover:underline"
          >
            History
          </Link>
          <Link
            href={`/projects/${projectId}/settings/templates`}
            className="text-neutral-600 hover:underline"
          >
            Templates
          </Link>
        </nav>
      </header>
      <div className="min-h-0 flex-1">
        <EditorMount projectId={projectId} tmpBranches={tmpBranches} />
      </div>
    </div>
  );
}
