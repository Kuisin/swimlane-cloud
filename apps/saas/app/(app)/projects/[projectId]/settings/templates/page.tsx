import Link from "next/link";
import TemplatesManager from "./TemplatesManager";

export const dynamic = "force-dynamic";

export default async function TemplatesSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Section templates</h1>
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-indigo-600 hover:underline"
        >
          ← Back to editor
        </Link>
      </div>
      <TemplatesManager projectId={projectId} />
    </main>
  );
}
