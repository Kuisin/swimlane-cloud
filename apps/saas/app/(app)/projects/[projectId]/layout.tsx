import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { requireProjectRole } from "@/lib/projects";

export const dynamic = "force-dynamic";

/**
 * Server-side gate for every project page: signed in, GitHub connected, and
 * the repository visible to that token. A repository GitHub hides from this
 * user is a 404 here too, so the URL confirms nothing.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  try {
    await requireProjectRole(projectId, "viewer");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect(`/login?next=${encodeURIComponent(`/projects/${projectId}`)}&error=needsAuth`);
    }
    notFound();
  }
  return <>{children}</>;
}
