"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { textToSvg } from "@swimlane-cloud/diagram-converter";
import { getPublished, type PublishedEntry } from "@/lib/demo-workflow";
import { FileTree } from "@/components/file-tree";

/**
 * Public share page (demo). Reads a published commit/version from the local
 * registry and shows its full folder/file tree with each diagram rendered
 * on-device. Demo only: the registry lives in localStorage, so a link resolves
 * in the same browser that published it.
 */
export default function PublicSharePage() {
  const params = useParams();
  const slug = String(params.slug);
  const [entry, setEntry] = useState<PublishedEntry | null | undefined>(undefined);

  useEffect(() => {
    setEntry(getPublished(slug));
  }, [slug]);

  const files = entry?.files ?? {};
  const paths = Object.keys(files)
    .filter((p) => p.endsWith(".txt"))
    .sort();
  const [path, setPath] = useState("");
  useEffect(() => {
    if (paths.length && !files[path]) setPath(paths[0]);
  }, [entry]); // eslint-disable-line react-hooks/exhaustive-deps

  const svg = useMemo(() => {
    const src = files[path];
    if (src) {
      try {
        return textToSvg(src, { themeKey: "basic" }).svg;
      } catch {
        return null;
      }
    }
    return entry?.svg ?? null;
  }, [files, path, entry]);

  if (entry === undefined) return <Centered>Loading…</Centered>;
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

  const dsl = files[path] ?? entry.dsl;

  return (
    <main className="mx-auto flex h-screen max-w-5xl flex-col px-4 py-6">
      <header className="mb-4 shrink-0">
        <div className="text-xs uppercase tracking-wide text-neutral-400">Published</div>
        <h1 className="text-2xl font-semibold">{entry.name}</h1>
        {entry.note && <p className="text-sm text-neutral-500">{entry.note}</p>}
      </header>

      <div className="flex min-h-0 flex-1 gap-4">
        {paths.length > 0 && (
          <aside className="w-48 shrink-0 overflow-auto rounded-lg border border-neutral-200 p-2">
            <FileTree paths={paths} active={path} onPick={setPath} />
          </aside>
        )}
        <section className="min-w-0 flex-1 overflow-auto">
          {svg ? (
            <div
              className="rounded-lg border border-neutral-200 bg-white p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <p className="text-sm text-neutral-500">No rendered diagram.</p>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-neutral-600">
              View DSL source
            </summary>
            <pre className="mt-2 overflow-auto rounded-md bg-neutral-50 p-4 font-mono text-xs text-neutral-700">
              {dsl}
            </pre>
          </details>
        </section>
      </div>

      <p className="mt-4 shrink-0 text-xs text-neutral-400">
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
