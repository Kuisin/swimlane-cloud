import { notFound, redirect } from "next/navigation";
import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { assertOwnerAllowed, assertOwnerRepo, assertRef, BadRequestError } from "@/lib/guard";
import { getSession } from "@/lib/repo";
import { EditorClient } from "./editor-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Editing always happens as a signed-in GitHub user; there is no service account. */
export default async function EditPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { owner, repo } = await params;
  const { branch } = await searchParams;

  try {
    assertOwnerRepo(owner, repo);
    assertOwnerAllowed(owner);
  } catch (err) {
    if (err instanceof BadRequestError) notFound();
    throw err;
  }

  const session = await getSession();
  if (!session) {
    redirect(`/api/auth/login?next=${encodeURIComponent(`/${owner}/${repo}/edit`)}`);
  }

  const target = branch ?? INTEGRATION_BRANCH;
  try {
    assertRef(target);
  } catch {
    notFound();
  }

  return <EditorClient owner={owner} repo={repo} branch={target} />;
}
