import Link from "next/link";
import { notFound } from "next/navigation";
import { textToSvg } from "@swimlane-cloud/diagram-converter";
import { DiagramViewer } from "@/components/diagram-viewer";
import {
  fileName,
  filesInFolder,
  folderName,
  readDiagram,
  resolveFolderToken,
} from "@/lib/content";

export const dynamic = "force-dynamic";

/**
 * Shared folder: /f/<token>?file=<relative path>. Lists every diagram in the
 * folder (including subfolders) and shows the selected one — file switching is
 * plain links so the page stays a server component.
 */
export default async function SharedFolderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ file?: string; view?: string }>;
}) {
  const { token } = await params;
  const { file, view } = await searchParams;
  const folderRel = resolveFolderToken(token);
  if (!folderRel) notFound();

  const files = filesInFolder(folderRel);
  if (files.length === 0) notFound();
  const active = file && files.includes(file) ? file : files[0];
  const dsl = readDiagram(`${folderRel}/${active}`);

  let svg: string | null = null;
  if (dsl != null) {
    try {
      svg = textToSvg(dsl, { themeKey: "basic" }).svg;
    } catch {
      svg = null;
    }
  }

  const viewQs = view ? `&view=${encodeURIComponent(view)}` : "";

  return (
    <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      <header className="mb-3 sm:mb-4">
        <div className="text-xs uppercase tracking-wide text-neutral-400">Shared folder</div>
        <h1 className="truncate text-xl font-semibold sm:text-2xl">{folderName(folderRel)}</h1>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <aside className="max-h-40 w-full shrink-0 overflow-auto rounded-lg border border-neutral-200 bg-white p-2 sm:max-h-[75vh] sm:w-56">
          <ul className="space-y-0.5">
            {files.map((f) => (
              <li key={f}>
                <Link
                  href={`?file=${encodeURIComponent(f)}${viewQs}`}
                  className={`block truncate rounded px-2 py-1 text-sm ${
                    f === active
                      ? "bg-indigo-50 font-medium text-indigo-700"
                      : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                  title={f}
                >
                  {fileName(f)}
                  {f.includes("/") && (
                    <span className="ml-1 text-xs text-neutral-400">
                      {f.slice(0, f.lastIndexOf("/"))}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <section className="min-w-0 flex-1">
          {dsl != null ? (
            <DiagramViewer key={active} svg={svg} dsl={dsl} />
          ) : (
            <p className="text-sm text-neutral-500">Could not read this diagram.</p>
          )}
        </section>
      </div>
    </main>
  );
}
