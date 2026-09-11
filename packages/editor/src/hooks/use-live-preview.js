import { useEffect, useRef, useState } from "react";
import { textToSvg } from "@swimlane-cloud/diagram-converter";

/**
 * Debounced live SVG render. Calls the DOM-free `textToSvg` engine and returns
 * the SVG string for injection via dangerouslySetInnerHTML, plus parse errors.
 */
export function useLivePreview(src, { themeKey, theme, layout, delay = 300 } = {}) {
  const [result, setResult] = useState({ svg: null, model: null, errors: [] });
  const timer = useRef(null);
  // Compared by value, not identity: a host that builds `layout` inline would
  // otherwise hand us a fresh object every render and restart the debounce
  // forever, so the preview would never settle.
  const layoutKey = layout ? JSON.stringify(layout) : "";
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const out = textToSvg(src, { theme, themeKey, layout: layoutRef.current });
        setResult({
          svg: out?.svg ?? null,
          model: out?.model ?? null,
          errors: out?.errors ?? [],
        });
      } catch (err) {
        setResult({
          svg: null,
          model: null,
          errors: [{ line: 0, msg: err?.message || "Render failed", text: "" }],
        });
      }
    }, delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [src, themeKey, theme, layoutKey, delay]);

  return result;
}
