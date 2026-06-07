import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderPartsPreviewHtml } from "@swimlane-cloud/diagram-converter";
import { THEMES } from "@swimlane-cloud/diagram-converter/themes";
import { extractPartsCode } from "../lib/parts-extract.js";

const OFFSET = 12;
const MARGIN = 8;

/**
 * Floating block / prop design preview. Fixed-position portal; pointer-events
 * none so it never steals focus from the editor underneath.
 */
export function PartsPreviewTooltip({ open, section, src, theme, id, anchor }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const activeTheme = theme ?? THEMES.basic;

  const html = useMemo(() => {
    if (!open || !id || !section) return "";
    const code = extractPartsCode(src, section, id);
    if (!code) return "";
    try {
      return renderPartsPreviewHtml(code, activeTheme);
    } catch {
      return "";
    }
  }, [open, id, section, src, activeTheme]);

  useLayoutEffect(() => {
    if (!open || !anchor || !html) return;
    const el = ref.current;
    if (!el) return;
    const { x, y } = anchor;
    const rect = el.getBoundingClientRect();
    let left = x + OFFSET;
    let top = y + OFFSET;
    if (left + rect.width > window.innerWidth - MARGIN) {
      left = Math.max(MARGIN, x - rect.width - OFFSET);
    }
    if (top + rect.height > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, y - rect.height - OFFSET);
    }
    setPos({ left, top });
  }, [open, anchor, html, id]);

  if (!open || !html || !anchor || typeof document === "undefined") return null;

  const styleLeft = pos.left || anchor.x + OFFSET;
  const styleTop = pos.top || anchor.y + OFFSET;

  return createPortal(
    <div
      ref={ref}
      className="sw-parts-tooltip"
      style={{ left: styleLeft, top: styleTop }}
      role="tooltip"
    >
      <div className="sw-parts-tooltip-label">
        {section === "block" ? "block" : "prop"} · {id}
      </div>
      <div className="sw-parts-preview" dangerouslySetInnerHTML={{ __html: html }} />
    </div>,
    document.body,
  );
}
