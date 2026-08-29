import { redirect } from "next/navigation";
import { parseRemoteUrl } from "@swimlane-cloud/github-client";

export const runtime = "nodejs";

/**
 * The whole app is addressable by URL, so the landing page only has to turn
 * something a user can paste — a clone URL, a browser URL, `owner/repo` — into
 * one of those addresses.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string; error?: string }>;
}) {
  const { repo: pasted, error } = await searchParams;

  async function open(formData: FormData) {
    "use server";
    const raw = String(formData.get("repo") ?? "");
    const parsed = parseRemoteUrl(raw);
    if (!parsed)
      redirect(`/?error=${encodeURIComponent("That does not look like a GitHub repository.")}`);
    redirect(`/${parsed.owner}/${parsed.repo}`);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Swimlane Hub</h1>
      <p className="mt-2 text-sm text-neutral-600">
        View kai-swimlane diagrams straight from a GitHub repository. Public repositories need no
        sign-in.
      </p>

      <form action={open} className="mt-6 flex gap-2">
        <input
          name="repo"
          defaultValue={pasted ?? ""}
          placeholder="owner/repo or a GitHub URL"
          aria-label="GitHub repository"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          Open
        </button>
      </form>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      <section className="mt-10 text-sm text-neutral-600">
        <h2 className="font-medium text-neutral-900">URL shapes</h2>
        <dl className="mt-2 space-y-1.5 font-mono text-xs">
          <div>
            <dt className="inline text-neutral-900">/owner/repo/path/to.txt</dt>
            <dd className="inline text-neutral-500"> — latest on the default branch</dd>
          </div>
          <div>
            <dt className="inline text-neutral-900">/owner/repo/t/v1.0.0/path/to.txt</dt>
            <dd className="inline text-neutral-500"> — a tagged release</dd>
          </div>
          <div>
            <dt className="inline text-neutral-900">/owner/repo/c/&lt;sha&gt;/path/to.txt</dt>
            <dd className="inline text-neutral-500"> — a permalink that never changes</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
