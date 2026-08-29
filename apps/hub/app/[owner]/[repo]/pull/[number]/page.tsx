import { notFound } from "next/navigation";
import {
  GitHubNotAccessibleError,
  GitHubRateLimitError,
  createPullsApi,
} from "@swimlane-cloud/github-client";
import { DiagramDiff, type DiffEntry } from "@/components/diagram-diff";
import { PrivateRepoNotice, RateLimitNotice } from "@/components/diagram-page";
import { assertOwnerAllowed, assertOwnerRepo, BadRequestError } from "@/lib/guard";
import { getReader, getRestClient } from "@/lib/repo";
import { render } from "@/lib/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A pull request, rendered as diagrams.
 *
 * Unlike the viewer routes this one needs REST — listing a PR's files has no
 * off-quota equivalent. That is an acceptable trade because reviewing is an
 * occasional, deliberate action rather than a hot path, and anyone doing it
 * repeatedly can sign in for the 5,000/hr budget.
 */
export default async function PullRequestPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>;
}) {
  const { owner, repo, number } = await params;

  try {
    assertOwnerRepo(owner, repo);
    assertOwnerAllowed(owner);
  } catch (err) {
    if (err instanceof BadRequestError) notFound();
    throw err;
  }

  const n = Number(number);
  if (!Number.isInteger(n) || n <= 0) notFound();

  try {
    const pulls = createPullsApi(await getRestClient(), { owner, repo });

    const [pr, files] = await Promise.all([
      pulls.getPullRequest(n),
      pulls.listPullFiles(n, { onlyExt: ".txt" }),
    ]);

    if (files.length === 0) {
      return (
        <Shell
          owner={owner}
          repo={repo}
          pr={{
            number: n,
            title: pr.title,
            htmlUrl: pr.htmlUrl,
            author: pr.author,
            base: pr.base,
            head: pr.head,
          }}
        >
          <p className="text-sm text-neutral-600">
            This pull request does not change any <code>.txt</code> diagrams.
          </p>
        </Shell>
      );
    }

    const reader = await getReader(owner, repo);
    const config = await reader.readConfig(pr.headSha).catch(() => ({ themeKey: "basic" }));

    // Read both sides of every changed file. A rename reads its old path on the
    // base side, or the "before" pane would always be empty.
    const entries: DiffEntry[] = await Promise.all(
      files.map(async (f) => {
        const beforePath = f.previousPath ?? f.path;
        const [before, after] = await Promise.all([
          f.status === "added" ? null : reader.readFile(beforePath, pr.baseSha).catch(() => null),
          f.status === "removed" ? null : reader.readFile(f.path, pr.headSha).catch(() => null),
        ]);

        return {
          path: f.path,
          status: f.status,
          previousPath: f.previousPath,
          beforeSvg: before ? render(before.text, config.themeKey).svg : null,
          afterSvg: after ? render(after.text, config.themeKey).svg : null,
          // GitHub can list a file whose content is unchanged (a merge, or a
          // change reverted within the branch); saying so beats showing two
          // identical drawings with no explanation.
          unchanged: Boolean(before && after && before.text === after.text),
        };
      }),
    );

    return (
      <Shell
        owner={owner}
        repo={repo}
        pr={{
          number: n,
          title: pr.title,
          htmlUrl: pr.htmlUrl,
          author: pr.author,
          base: pr.base,
          head: pr.head,
        }}
      >
        <DiagramDiff entries={entries} />
      </Shell>
    );
  } catch (err) {
    if (err instanceof GitHubNotAccessibleError) {
      if (err.authWouldHelp) return <PrivateRepoNotice owner={owner} repo={repo} />;
      notFound();
    }
    if (err instanceof GitHubRateLimitError) return <RateLimitNotice error={err} />;
    throw err;
  }
}

function Shell({
  owner,
  repo,
  pr,
  children,
}: {
  owner: string;
  repo: string;
  pr: {
    number: number;
    title: string;
    htmlUrl: string;
    author: string | null;
    base: string;
    head: string;
  };
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <a
            href={`https://github.com/${owner}/${repo}`}
            className="font-medium text-neutral-700 hover:underline"
          >
            {owner}/{repo}
          </a>
          <span className="font-mono">#{pr.number}</span>
          {pr.author ? <span>by {pr.author}</span> : null}
          <span className="font-mono text-[11px]">
            {pr.head} &rarr; {pr.base}
          </span>
        </div>
        <h1 className="mt-1 text-xl font-semibold sm:text-2xl">{pr.title}</h1>
        <a href={pr.htmlUrl} className="mt-1 inline-block text-xs text-neutral-500 hover:underline">
          Review and approve on GitHub &rarr;
        </a>
      </header>
      {children}
    </main>
  );
}
