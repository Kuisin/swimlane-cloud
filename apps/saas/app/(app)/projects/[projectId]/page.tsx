import Link from "next/link";
import EditorMount from "./EditorMount";
import { demoProjectName } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function ProjectEditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const projectName = demoProjectName(projectId);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-16 items-center justify-between border-b border-neutral-200 px-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold">{projectName}</h1>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
          Demo · saved in your browser
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <EditorMount projectId={projectId} />
      </div>
    </div>
  );
}
