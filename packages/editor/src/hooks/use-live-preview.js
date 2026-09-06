import { useEffect, useRef, useState } from "react";
import { textToSvg } from "@swimlane-cloud/diagram-converter";

/**
 * Debounced live SVG render. Calls the DOM-free `textToSvg` engine and returns
 * the SVG string for injection via dangerouslySetInnerHTML, plus parse errors.
 *
 * `resolveImport` / `resolveAsset` / `filename` must be the same resolved
 * values the caller's own (undebounced) parse uses — pass the provider's
 * `parseOptions` — or this parse disagrees with that one about whether an
 * `@use` import resolved, showing an error the other view already cleared.
 */
export function useLivePreview(
  src,
  { themeKey, theme, delay = 300, resolveImport, resolveAsset, filename } = {},
) {
  const [result, setResult] = useState({ svg: null, model: null, errors: [] });
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const out = textToSvg(src, { theme, themeKey, resolveImport, resolveAsset, filename });
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
  }, [src, themeKey, theme, delay, resolveImport, resolveAsset, filename]);

  return result;
}
