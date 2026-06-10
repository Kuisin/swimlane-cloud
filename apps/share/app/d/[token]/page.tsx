import { notFound } from "next/navigation";
import { textToSvg } from "@swimlane-cloud/diagram-converter";
import { DiagramViewer } from "@/components/diagram-viewer";
import { fileName, readDiagram, resolveFileToken } from "@/lib/content";

export const dynamic = "force-dynamic";

/** Single shared diagram: /d/<token>. */
export default async function SharedFilePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const rel = resolveFileToken(token);
  const dsl = rel ? readDiagram(rel) : null;
  if (!rel || dsl == null) notFound();

  let svg: string | null = null;
  try {
    svg = textToSvg(dsl, { themeKey: "basic" }).svg;
  } catch {
    svg = null;
  }

  return (
    <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
      <header className="mb-3 sm:mb-4">
        <div className="text-xs uppercase tracking-wide text-neutral-400">Shared diagram</div>
        <h1 className="truncate text-xl font-semibold sm:text-2xl">{fileName(rel)}</h1>
      </header>
      <DiagramViewer svg={svg} dsl={dsl} />
    </main>
  );
}
