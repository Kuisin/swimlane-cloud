import { redirect } from "next/navigation";

// Template management needs the backend; not available in demo mode.
export default async function TemplatesRedirect({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}`);
}
