import { redirect } from "next/navigation";

// In demo mode, history lives in the in-app workflow panel (no backend).
export default async function HistoryRedirect({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}`);
}
