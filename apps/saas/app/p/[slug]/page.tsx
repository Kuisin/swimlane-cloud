"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Monitor, Smartphone } from "lucide-react";
import { textToSvg } from "@swimlane-cloud/diagram-converter";
import { MobileDiagram } from "@swimlane-cloud/mobile-view";
import { getPublished, type PublishedEntry } from "@/lib/demo-workflow";
import { FileTree } from "@/components/file-tree";

type ShareView = "diagram" | "mobile";

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

  // Block copy-oriented keyboard shortcuts (Ctrl/Cmd + C, A, S, P, U) and F12.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (["c", "a", "s", "p", "u"].includes(e.key.toLowerCase())) {
          e.preventDefault();
        }
      }
      if (e.key === "F12") e.preventDefault();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const files = entry?.files ?? {};
  const paths = Object.keys(files)
    .filter((p) => p.endsWith(".txt"))
    .sort();
  const titles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [p, content] of Object.entries(files)) {
      if (content && p.endsWith(".txt")) {
        const t = extractTitle(content);
        if (t) map[p] = t;
      }
    }
    return map;
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps
  const [path, setPath] = useState("");
  // Restore the opened file from the URL (?file=) once the entry loads.
  useEffect(() => {
    if (!paths.length) return;
    const wanted = new URLSearchParams(window.location.search).get("file");
    if (wanted && files[wanted]) setPath(wanted);
    else if (!files[path]) setPath(paths[0]);
  }, [entry]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the opened file in the URL so it's shareable/bookmarkable.
  useEffect(() => {
    if (!path) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("file") === path) return;
    params.set("file", path);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [path]);

  // Diagram (SVG) vs mobile (vertical card) view. Defaults to mobile on
  // narrow screens; an explicit ?view= in the URL wins so links keep their look.
  const [view, setView] = useState<ShareView>("diagram");
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("view");
    if (wanted === "mobile" || wanted === "diagram") setView(wanted);
    else if (window.matchMedia("(max-width: 640px)").matches) setView("mobile");
  }, []);
  // Keep the chosen view in the URL so it's shareable/bookmarkable.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if ((params.get("view") ?? "diagram") === view) return;
    if (view === "diagram") params.delete("view");
    else params.set("view", view);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [view]);

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
          No published version for <code>/p/{slug}</code> in this browser. (Demo links resolve only
          where they were published.)
        </p>
      </Centered>
    );
  }

  const dsl = files[path] ?? entry.dsl;
  const showDsl = entry.shareMode === "svg_and_dsl";
  // Mobile mode renders from the DSL source; entries published without it
  // (SVG-only) can only show the diagram view.
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
          <h1 className="truncate text-xl font-semibold sm:text-2xl">{entry.name}</h1>
          {entry.note && <p className="text-sm text-neutral-500">{entry.note}</p>}
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

      {/* Sidebar + content side-by-side on sm+; stacked (tree above, capped
          height) on phones so the diagram keeps the width. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row sm:gap-4 print:hidden">
        {paths.length > 0 && (
          <aside className="max-h-36 w-full shrink-0 overflow-auto rounded-lg border border-neutral-200 p-2 sm:max-h-none sm:w-48">
            <FileTree paths={paths} active={path} onPick={setPath} titleOf={(id) => titles[id]} />
          </aside>
        )}
        <section className="min-w-0 flex-1 overflow-auto">
          {showMobile ? (
            // Mobile cards stay interactive (tap to expand) — read-only, no
            // edit callbacks — so no pointer-events-none here; select-none and
            // the context-menu block on <main> still apply.
            <div className="mx-auto max-w-md rounded-lg border border-neutral-200 bg-white p-3">
              <MobileDiagram dsl={dsl} />
            </div>
          ) : svg ? (
            // pointer-events-none prevents drag-to-desktop and SVG interaction.
            <div
              className="pointer-events-none rounded-lg border border-neutral-200 bg-white p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <p className="text-sm text-neutral-500">No rendered diagram.</p>
          )}
          {showDsl && dsl && (
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
        Shared read-only via Swimlane Cloud (demo). Content is protected.
      </p>
    </main>
  );
}

function extractTitle(dsl: string): string {
  const lines = dsl.split("\n");
  let inTitle = false;
  const parts: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t === "/title/") {
      inTitle = true;
      continue;
    }
    if (inTitle) {
      if (t.startsWith("/") || t === "@end") break;
      if (t) parts.push(t);
    }
  }
  return parts.join(" ");
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div>{children}</div>
    </main>
  );
}
