"use client";

import { useEffect, useMemo, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { MobileDiagram } from "@swimlane-cloud/mobile-view";
import { FileTree } from "@/components/file-tree";

export interface SharedFile {
  path: string;
  title: string | null;
  /** Rendered server-side; null when the file could not be drawn. */
  svg: string | null;
  /** Only present for `svg_and_dsl` links. */
  dsl: string | null;
}

type ShareView = "diagram" | "mobile";

/**
 * Public, read-only view of a published version: the folder tree, each
 * diagram as pre-rendered SVG, and — when the owner allowed it — the DSL
 * source and the mobile card view (which needs the source to render).
 */
export function ShareClient({
  name,
  note,
  shareMode,
  files,
}: {
  name: string;
  note: string | null;
  shareMode: "svg_only" | "svg_and_dsl";
  files: SharedFile[];
}) {
  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const paths = useMemo(() => files.map((f) => f.path), [files]);
  const [path, setPath] = useState(paths[0] ?? "");
  const [view, setView] = useState<ShareView>("diagram");

  // Block copy-oriented keyboard shortcuts (Ctrl/Cmd + C, A, S, P, U) and F12.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (["c", "a", "s", "p", "u"].includes(e.key.toLowerCase())) e.preventDefault();
      }
      if (e.key === "F12") e.preventDefault();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Restore ?file= and ?view= from the URL once; defaults to mobile on phones.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("file");
    if (wanted && byPath.has(wanted)) setPath(wanted);
    const v = params.get("view");
    if (v === "mobile" || v === "diagram") setView(v);
    else if (window.matchMedia("(max-width: 640px)").matches) setView("mobile");
  }, [byPath]);

  // Keep the opened file and view in the URL so links are shareable.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (path) params.set("file", path);
    if (view === "diagram") params.delete("view");
    else params.set("view", view);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [path, view]);

  const file = byPath.get(path) ?? files[0];
  const dsl = file?.dsl ?? null;
  const canMobile = Boolean(dsl);
  const showMobile = view === "mobile" && canMobile;

  return (
    // select-none + onContextMenu prevent casual text selection and right-click copy.
    // print:hidden hides diagram content from print/PDF export.
    <main
      className="mx-auto flex h-screen max-w-5xl select-none flex-col px-3 py-4 sm:px-4 sm:py-6"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="mb-3 flex shrink-0 items-start justify-between gap-3 sm:mb-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Published</div>
          <h1 className="truncate text-xl font-semibold sm:text-2xl">{name}</h1>
          {note && <p className="text-sm text-neutral-500">{note}</p>}
        </div>
        {canMobile && (
          <div
            className="flex shrink-0 overflow-hidden rounded-md border border-neutral-300 text-xs"
            role="group"
            aria-label="View mode"
          >
            <ViewButton
              active={!showMobile}
              onClick={() => setView("diagram")}
              icon={<Monitor size={13} aria-hidden />}
              label="Diagram"
            />
            <ViewButton
              active={showMobile}
              onClick={() => setView("mobile")}
              icon={<Smartphone size={13} aria-hidden />}
              label="Mobile"
            />
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row sm:gap-4 print:hidden">
        {paths.length > 1 && (
          <aside className="max-h-36 w-full shrink-0 overflow-auto rounded-lg border border-neutral-200 p-2 sm:max-h-none sm:w-48">
            <FileTree
              paths={paths}
              active={file?.path ?? ""}
              onPick={setPath}
              titleOf={(id) => byPath.get(id)?.title ?? undefined}
            />
          </aside>
        )}
        <section className="min-w-0 flex-1 overflow-auto">
          {showMobile && dsl ? (
            <div className="mx-auto max-w-md rounded-lg border border-neutral-200 bg-white p-3">
              <MobileDiagram dsl={dsl} />
            </div>
          ) : file?.svg ? (
            // pointer-events-none prevents drag-to-desktop and SVG interaction.
            <div
              className="pointer-events-none rounded-lg border border-neutral-200 bg-white p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: file.svg }}
            />
          ) : (
            <p className="text-sm text-neutral-500">This diagram could not be rendered.</p>
          )}
          {shareMode === "svg_and_dsl" && dsl && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-neutral-600">
                View DSL source
              </summary>
              <pre className="mt-2 overflow-auto rounded-md bg-neutral-50 p-4 font-mono text-xs text-neutral-700">
                {dsl}
              </pre>
            </details>
          )}
        </section>
      </div>

      <p className="mt-4 shrink-0 text-xs text-neutral-400">
        Shared read-only via Swimlane Cloud. Content is protected.
      </p>
    </main>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 font-medium ${
        active ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
