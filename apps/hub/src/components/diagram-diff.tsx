"use client";

import { useState } from "react";
import { Columns2, Layers } from "lucide-react";

export interface DiffEntry {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  previousPath: string | null;
  beforeSvg: string | null;
  afterSvg: string | null;
  /** True when the DSL text is byte-identical despite GitHub listing the file. */
  unchanged: boolean;
}

const TONE: Record<DiffEntry["status"], string> = {
  added: "bg-emerald-50 text-emerald-700 border-emerald-200",
  removed: "bg-red-50 text-red-700 border-red-200",
  renamed: "bg-blue-50 text-blue-700 border-blue-200",
  modified: "bg-amber-50 text-amber-800 border-amber-200",
};

/**
 * A pull request rendered as diagrams rather than as a unified diff.
 *
 * A DSL text diff is close to unreadable for a reviewer who did not write it:
 * a one-line change can move a whole lane, and a large reordering can be
 * semantically trivial. Showing the drawing on each side is what makes an
 * approval decision possible without reconstructing the diagram mentally.
 */
export function DiagramDiff({ entries }: { entries: DiffEntry[] }) {
  const [layout, setLayout] = useState<"side-by-side" | "stacked">("side-by-side");

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-neutral-300 text-xs">
          <LayoutButton
            active={layout === "side-by-side"}
            onClick={() => setLayout("side-by-side")}
          >
            <Columns2 size={13} aria-hidden /> Side by side
          </LayoutButton>
          <LayoutButton active={layout === "stacked"} onClick={() => setLayout("stacked")}>
            <Layers size={13} aria-hidden /> Stacked
          </LayoutButton>
        </div>
        <span className="text-xs text-neutral-500">
          {entries.length} diagram{entries.length === 1 ? "" : "s"} changed
        </span>
      </div>

      <div className="space-y-8">
        {entries.map((e) => (
          <section key={e.path}>
            <header className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${TONE[e.status]}`}
              >
                {e.status}
              </span>
              <h2 className="font-mono text-sm">{e.path}</h2>
              {e.previousPath ? (
                <span className="font-mono text-xs text-neutral-500">was {e.previousPath}</span>
              ) : null}
              {e.unchanged ? (
                <span className="text-xs text-neutral-500">
                  source identical — no visual change
                </span>
              ) : null}
            </header>

            <div
              className={
                layout === "side-by-side" && e.beforeSvg && e.afterSvg
                  ? "grid gap-3 md:grid-cols-2"
                  : "space-y-3"
              }
            >
              {e.status !== "added" ? <Pane label="Before" svg={e.beforeSvg} muted /> : null}
              {e.status !== "removed" ? <Pane label="After" svg={e.afterSvg} /> : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Pane({
  label,
  svg,
  muted = false,
}: {
  label: string;
  svg: string | null;
  muted?: boolean;
}) {
  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-xs font-medium text-neutral-500">{label}</figcaption>
      {svg ? (
        <div
          className={`overflow-auto rounded-lg border bg-white p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full ${
            muted ? "border-neutral-200 opacity-80" : "border-neutral-300"
          }`}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-500">
          {label === "Before" ? "Did not exist" : "Could not be rendered"}
        </div>
      )}
    </figure>
  );
}

function LayoutButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
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
      {children}
    </button>
  );
}
