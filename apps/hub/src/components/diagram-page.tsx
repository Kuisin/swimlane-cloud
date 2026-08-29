import Link from "next/link";
import { notFound } from "next/navigation";
import { GitHubNotAccessibleError, GitHubRateLimitError } from "@swimlane-cloud/github-client";
import { DiagramViewer } from "@/components/diagram-viewer";
import { getReader } from "@/lib/repo";
import { extractTitle, render } from "@/lib/render";

export interface DiagramPageProps {
  owner: string;
  repo: string;
  /** Commit sha the content is read at — always resolved before we get here. */
  sha: string;
  path: string;
  /**
   * How the visitor addressed this content, for the header and the canonical
   * link. Named `refInfo`, not `ref`: React reserves `ref` as an element ref,
   * and passing an object through it fails at runtime in a Server Component.
   */
  refInfo: { kind: "sha" | "tag" | "branch"; label: string };
}

/**
 * One renderer for every route. `/{owner}/{repo}/{path}` resolves the default
 * branch and then calls this with the resolved sha, rather than redirecting:
 * a redirect doubles the round trip and hands whoever shares the link a URL
 * that churns every time the branch moves.
 */
/**
 * One renderer for every route. `/{owner}/{repo}/{path}` resolves the default
 * branch and then calls this with the resolved sha, rather than redirecting:
 * a redirect doubles the round trip and hands whoever shares the link a URL
 * that churns every time the branch moves.
 */
export async function DiagramPage({ owner, repo, sha, path, refInfo }: DiagramPageProps) {
  const loaded = await loadDiagram(owner, repo, sha, path);

  if (loaded.kind === "private") return <PrivateRepoNotice owner={owner} repo={repo} />;
  if (loaded.kind === "throttled") return <RateLimitNotice error={loaded.error} />;
  if (loaded.kind === "missing") notFound();

  const { dsl, themeKey } = loaded;
  const { svg, errors } = render(dsl, themeKey);
  const title = extractTitle(dsl) ?? path.split("/").pop() ?? path;
  const canonical = `/${owner}/${repo}/c/${sha}/${path}`;

  return (
    <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
      <header className="mb-3 sm:mb-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <a
            href={`https://github.com/${owner}/${repo}`}
            className="font-medium text-neutral-700 hover:underline"
          >
            {owner}/{repo}
          </a>
          <RefBadge kind={refInfo.kind} label={refInfo.label} />
          <span className="truncate">{path}</span>
        </div>
        <h1 className="mt-1 truncate text-xl font-semibold sm:text-2xl">{title}</h1>
      </header>

      <DiagramViewer svg={svg} dsl={dsl} />

      {errors.length > 0 ? (
        <details className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <summary className="cursor-pointer font-medium">
            {errors.length} issue{errors.length === 1 ? "" : "s"} in this diagram
          </summary>
          <ul className="mt-1.5 space-y-0.5">
            {errors.slice(0, 20).map((e, i) => (
              <li key={i}>
                {e.line ? <span className="text-amber-600">line {e.line}: </span> : null}
                {e.msg ?? e.text}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <footer className="mt-4 flex flex-wrap gap-3 text-xs text-neutral-500">
        {refInfo.kind !== "sha" ? (
          <Link href={canonical} className="hover:underline">
            Permalink to this exact version
          </Link>
        ) : null}
        <a href={`/${owner}/${repo}/svg/${sha}/${path}`} className="hover:underline">
          SVG
        </a>
        <a
          href={`https://github.com/${owner}/${repo}/blob/${sha}/${path}`}
          className="hover:underline"
        >
          Source on GitHub
        </a>
      </footer>
    </main>
  );
}

type LoadResult =
  | { kind: "ok"; dsl: string; themeKey: string }
  | { kind: "missing" }
  | { kind: "private" }
  | { kind: "throttled"; error: GitHubRateLimitError };

/**
 * Reads the DSL and the repo config together. Both failure modes that are not
 * bugs — a private repo, a throttled client — become values rather than
 * exceptions, so the page can render something useful instead of a 500.
 */
async function loadDiagram(
  owner: string,
  repo: string,
  sha: string,
  path: string,
): Promise<LoadResult> {
  try {
    const reader = await getReader(owner, repo);
    const [blob, config] = await Promise.all([reader.readFile(path, sha), reader.readConfig(sha)]);
    if (!blob) return { kind: "missing" };
    return { kind: "ok", dsl: blob.text, themeKey: config.themeKey };
  } catch (err) {
    if (err instanceof GitHubNotAccessibleError) {
      // Measured: the git endpoints answer 401 for a private repo while REST
      // answers 404, so `authWouldHelp` is the one signal that lets us honestly
      // offer sign-in rather than just saying "not found".
      return err.authWouldHelp ? { kind: "private" } : { kind: "missing" };
    }
    if (err instanceof GitHubRateLimitError) return { kind: "throttled", error: err };
    throw err;
  }
}

function RefBadge({ kind, label }: { kind: "sha" | "tag" | "branch"; label: string }) {
  const tone =
    kind === "tag"
      ? "bg-emerald-50 text-emerald-700"
      : kind === "sha"
        ? "bg-neutral-100 text-neutral-600"
        : "bg-blue-50 text-blue-700";
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${tone}`}>
      {kind === "sha" ? label.slice(0, 7) : label}
    </span>
  );
}

export function PrivateRepoNotice({ owner, repo }: { owner: string; repo: string }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">This repository is private</h1>
      <p className="mt-2 text-sm text-neutral-600">
        {owner}/{repo} is not readable without credentials. Sign in with GitHub to view diagrams
        from repositories you have access to.
      </p>
      <a
        href={`/api/auth/login?next=${encodeURIComponent(`/${owner}/${repo}`)}`}
        className="mt-4 inline-block rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
      >
        Sign in with GitHub
      </a>
    </main>
  );
}

export function RateLimitNotice({ error }: { error: GitHubRateLimitError }) {
  const when = error.resetAt
    ? error.resetAt.toLocaleTimeString()
    : error.retryAfterSeconds
      ? `about ${Math.ceil(error.retryAfterSeconds / 60)} minute(s)`
      : "shortly";
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">GitHub is rate limiting us</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Anonymous GitHub access is capped per IP address. Try again at {when}, or sign in to use
        your own much larger quota.
      </p>
    </main>
  );
}
