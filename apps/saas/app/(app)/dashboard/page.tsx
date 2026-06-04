import Link from "next/link";
import { getServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ProjectRow {
  id: string;
  name: string;
  workspace: { name: string } | null;
}

export default async function DashboardPage() {
  // Guard missing env at runtime (build runs with no env / no network).
  let error: string | null = null;
  let signedIn = false;
  let projects: ProjectRow[] = [];

  try {
    const user = await getCurrentUser();
    signedIn = !!user;
    if (user) {
      const supabase = await getServerSupabase();
      const { data } = await supabase
        .from("projects")
        .select("id, name, workspaces(name)")
        .order("created_at", { ascending: false });
      projects = (data ?? []).map((p) => {
        // Supabase may type an embedded relation as object or array.
        const wsRaw = (p as { workspaces?: unknown }).workspaces;
        const ws = Array.isArray(wsRaw) ? wsRaw[0] : wsRaw;
        const wsName = (ws as { name?: string } | undefined)?.name;
        return {
          id: p.id as string,
          name: p.name as string,
          workspace: wsName ? { name: wsName } : null,
        };
      });
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load dashboard";
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {!signedIn && (
          <Link
            href="/login"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Sign in
          </Link>
        )}
      </div>

      {error && (
        <p className="mb-6 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </p>
      )}

      {!signedIn && !error && (
        <p className="text-sm text-neutral-500">
          Please sign in to view your workspaces and projects.
        </p>
      )}

      {signedIn && projects.length === 0 && !error && (
        <p className="text-sm text-neutral-500">
          No projects yet. Create a workspace via{" "}
          <code className="rounded bg-neutral-100 px-1">POST /api/workspaces</code>
          .
        </p>
      )}

      <ul className="space-y-3">
        {projects.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 p-4"
          >
            <div>
              <p className="font-medium">{p.name}</p>
              {p.workspace && (
                <p className="text-xs text-neutral-500">{p.workspace.name}</p>
              )}
            </div>
            <Link
              href={`/projects/${p.id}`}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              Open
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
