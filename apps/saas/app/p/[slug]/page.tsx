"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getPublished, type PublishedEntry } from "@/lib/demo-workflow";

/**
 * Public share page (demo). Reads a published version from the local registry
 * and renders its SVG + read-only DSL. Demo only: the registry lives in
 * localStorage, so a link resolves in the same browser that published it.
 */
export default function PublicSharePage() {
  const params = useParams();
  const slug = String(params.slug);
  const [entry, setEntry] = useState<PublishedEntry | null | undefined>(undefined);

  useEffect(() => {
    setEntry(getPublished(slug));
  }, [slug]);

  if (entry === undefined) {
    return <Centered>Loading…</Centered>;
  }
  if (!entry) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Not found</h1>
        <p className="mt-1 text-sm text-neutral-500">
          No published version for <code>/p/{slug}</code> in this browser. (Demo
          links resolve only where they were published.)
        </p>
      </Centered>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wide text-neutral-400">
          Published version
        </div>
        <h1 className="text-2xl font-semibold">{entry.name}</h1>
        {entry.note && <p className="text-sm text-neutral-500">{entry.note}</p>}
      </div>

      {entry.svg ? (
        <div
          className="overflow-auto rounded-lg border border-neutral-200 bg-white p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: entry.svg }}
        />
      ) : (
        <p className="text-sm text-neutral-500">No rendered diagram.</p>
      )}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium text-neutral-600">
          View DSL source
        </summary>
        <pre className="mt-2 overflow-auto rounded-md bg-neutral-50 p-4 font-mono text-xs text-neutral-700">
          {entry.dsl}
        </pre>
      </details>

      <p className="mt-8 text-xs text-neutral-400">
        Shared read-only via Swimlane Cloud (demo).
      </p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div>{children}</div>
    </main>
  );
}
