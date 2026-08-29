import { notFound } from "next/navigation";
import { GitHubNotAccessibleError, GitHubRateLimitError } from "@swimlane-cloud/github-client";
import { DiagramPage, PrivateRepoNotice, RateLimitNotice } from "@/components/diagram-page";
import { getReader } from "@/lib/repo";
import {
  assertDiagramPath,
  assertOwnerAllowed,
  assertOwnerRepo,
  BadRequestError,
} from "@/lib/guard";

export const runtime = "nodejs";
/**
 * Mutable view. The long stale-while-revalidate is the primary rate-limit
 * defence: it lets a popular diagram serve from cache for a day while a single
 * background request refreshes it.
 */
export const revalidate = 60;

/**
 * Latest on the repository's default branch.
 *
 * The branch is NOT hardcoded to `main` — `ls-refs` hands back
 * `HEAD symref-target:refs/heads/<x>` for free, and repos defaulting to
 * `master` or `trunk` are common enough to matter.
 */
export default async function LatestDiagram({
  params,
}: {
  params: Promise<{ owner: string; repo: string; path: string[] }>;
}) {
  const { owner, repo, path } = await params;
  try {
    assertOwnerRepo(owner, repo);
    assertOwnerAllowed(owner);
    const filePath = assertDiagramPath(path);

    const reader = await getReader(owner, repo);
    const branch = await reader.defaultBranch();
    const resolved = await reader.resolveRef(branch);

    return (
      <DiagramPage
        owner={owner}
        repo={repo}
        sha={resolved.sha}
        path={filePath}
        refInfo={{ kind: "branch", label: branch }}
      />
    );
  } catch (err) {
    if (err instanceof BadRequestError) notFound();
    if (err instanceof GitHubNotAccessibleError) {
      // Resolving the ref happens before DiagramPage renders, so this route has
      // to handle the private-repo case itself — otherwise a repo that merely
      // needs sign-in 500s instead of offering the sign-in.
      if (err.authWouldHelp) return <PrivateRepoNotice owner={owner} repo={repo} />;
      notFound();
    }
    if (err instanceof GitHubRateLimitError) return <RateLimitNotice error={err} />;
    throw err;
  }
}
