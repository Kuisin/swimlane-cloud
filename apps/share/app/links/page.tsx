import {
  fileToken,
  folderToken,
  hasRealSecret,
  isLinksKey,
  listFiles,
  listFolders,
} from "@/lib/content";

export const dynamic = "force-dynamic";

/**
 * Owner-only index of every share link. Gated by the token secret itself:
 * /links?key=<SHARE_TOKEN_SECRET> (or ?key=dev when no secret is configured).
 */
export default async function LinksPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  if (!isLinksKey(key)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-semibold">Not available</h1>
        <p className="mt-1 text-sm text-neutral-500">
          This index requires the owner key: <code>/links?key=…</code>
        </p>
      </main>
    );
  }

  const folders = listFolders();
  const files = listFiles();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Share links</h1>
      {!hasRealSecret() && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          SHARE_TOKEN_SECRET is not set — these are predictable dev tokens. Set
          the env var before sharing anything.
        </p>
      )}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Folders
      </h2>
      <LinkTable rows={folders.map((f) => [f, `/f/${folderToken(f)}`])} empty="No folders yet." />

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Files
      </h2>
      <LinkTable rows={files.map((f) => [f, `/d/${fileToken(f)}`])} empty="No .txt files in content/ yet." />
    </main>
  );
}

function LinkTable({ rows, empty }: { rows: [string, string][]; empty: string }) {
  if (rows.length === 0) return <p className="mt-2 text-sm text-neutral-500">{empty}</p>;
  return (
    <ul className="mt-2 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
      {rows.map(([label, href]) => (
        <li key={href} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
          <span className="font-mono text-neutral-700">{label}</span>
          <a className="font-mono text-indigo-600 hover:underline" href={href}>
            {href}
          </a>
        </li>
      ))}
    </ul>
  );
}
