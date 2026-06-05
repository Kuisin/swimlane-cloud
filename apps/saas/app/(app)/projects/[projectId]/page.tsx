import WorkflowShell from "./WorkflowShell";
import { demoProjectName } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function ProjectEditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <WorkflowShell projectId={projectId} projectName={demoProjectName(projectId)} />
  );
}
