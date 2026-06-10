"use client";

import { useEffect, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { MobileDiagram } from "@swimlane-cloud/mobile-view";

type View = "diagram" | "mobile";

/**
 * Anyone-with-the-link viewer: server-rendered SVG for diagram mode, the
 * mobile card view (rendered client-side from the DSL) for phones. The chosen
 * mode defaults to mobile on narrow screens, is kept in the URL (?view=) so a
 * forwarded link keeps its look, and can be switched any time.
 */
export function DiagramViewer({ svg, dsl }: { svg: string | null; dsl: string }) {
  const [view, setView] = useState<View>("diagram");

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("view");
    if (wanted === "mobile" || wanted === "diagram") setView(wanted);
    else if (window.matchMedia("(max-width: 640px)").matches) setView("mobile");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if ((params.get("view") ?? "diagram") === view) return;
    if (view === "diagram") params.delete("view");
    else params.set("view", view);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [view]);

  return (
    <div>
      <div
        className="mb-3 flex w-fit overflow-hidden rounded-md border border-neutral-300 text-xs"
        role="group"
        aria-label="View mode"
      >
        <ModeButton active={view === "diagram"} onClick={() => setView("diagram")}>
          <Monitor size={13} aria-hidden /> Diagram
        </ModeButton>
        <ModeButton active={view === "mobile"} onClick={() => setView("mobile")}>
          <Smartphone size={13} aria-hidden /> Mobile
        </ModeButton>
      </div>

      {view === "mobile" ? (
        <div className="mx-auto max-w-md rounded-lg border border-neutral-200 bg-white p-3">
          <MobileDiagram dsl={dsl} />
        </div>
      ) : svg ? (
        <div
          className="overflow-auto rounded-lg border border-neutral-200 bg-white p-3 sm:p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <p className="text-sm text-neutral-500">
          This diagram could not be rendered — try the mobile view.
        </p>
      )}
    </div>
  );
}

function ModeButton({
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
