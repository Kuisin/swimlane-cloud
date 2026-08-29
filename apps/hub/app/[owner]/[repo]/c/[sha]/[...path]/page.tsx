import { notFound } from "next/navigation";
import { DiagramPage } from "@/components/diagram-page";
import {
  assertDiagramPath,
  assertOwnerAllowed,
  assertOwnerRepo,
  assertSha,
  BadRequestError,
} from "@/lib/guard";

export const runtime = "nodejs";

/**
 * The canonical URL. A 40-char commit sha addresses content that cannot change,
 * so this is the only route that may be cached indefinitely — and the only one
 * safe to hand out as a permalink.
 */
export default async function CommitDiagram({
  params,
}: {
  params: Promise<{ owner: string; repo: string; sha: string; path: string[] }>;
}) {
  const { owner, repo, sha, path } = await params;
  try {
    assertOwnerRepo(owner, repo);
    assertOwnerAllowed(owner);
    assertSha(sha);
    const filePath = assertDiagramPath(path);
    return (
      <DiagramPage
        owner={owner}
        repo={repo}
        sha={sha}
        path={filePath}
        refInfo={{ kind: "sha", label: sha }}
      />
    );
  } catch (err) {
    if (err instanceof BadRequestError) notFound();
    throw err;
  }
}
