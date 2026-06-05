import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-widest text-indigo-600">
          Swimlane Cloud
        </p>
        <h1 className="text-4xl font-bold tracking-tight">
          Git-backed diagrams for business processes
        </h1>
        <p className="text-lg text-neutral-600">
          Author swimlane diagrams in a shared editor, save drafts, checkpoint
          to git, flag versions, and publish — without ever touching git
          directly.
        </p>
      </header>

      <div className="flex flex-wrap gap-4">
        <Link
          href="/dashboard"
          className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Open dashboard
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          Sign in
        </Link>
      </div>

      <ul className="grid gap-3 text-sm text-neutral-600 sm:grid-cols-2">
        <li className="rounded-lg border border-neutral-200 p-4">
          <span className="font-semibold text-neutral-900">Draft & checkpoint</span>
          <br />
          Fast Postgres drafts, grouped git commits on demand.
        </li>
        <li className="rounded-lg border border-neutral-200 p-4">
          <span className="font-semibold text-neutral-900">Flag versions</span>
          <br />
          Render canonical SVG only when you flag a new version on test.
        </li>
        <li className="rounded-lg border border-neutral-200 p-4">
          <span className="font-semibold text-neutral-900">Promote to main</span>
          <br />
          Promote flagged versions to production with a gated merge.
        </li>
        <li className="rounded-lg border border-neutral-200 p-4">
          <span className="font-semibold text-neutral-900">Public sharing</span>
          <br />
          Share a stable read-only link for versions on main.
        </li>
      </ul>
    </main>
  );
}
