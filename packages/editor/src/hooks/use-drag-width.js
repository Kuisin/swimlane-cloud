import { useCallback, useEffect, useState } from "react";

/**
 * Pixel-width drag sizing for a side panel. Returns the current width plus a
 * pointer-down handler for a drag handle. `edge` says which side the handle sits
 * on: `"right"` (panel on the left, grows as you drag right) or `"left"` (panel
 * on the right, grows as you drag left).
 *
 * Pass `storageKey` to persist the width in localStorage: it's restored after
 * mount (client-only, so SSR markup matches) and saved when a drag ends.
 */
export function useDragWidth(initial, { min = 160, max = 600, edge = "right", storageKey } = {}) {
  const [width, setWidth] = useState(initial);

  // Restore once on mount. Done in an effect (not lazy init) so the first
  // client render matches the server and there's no hydration mismatch.
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const saved = Number(window.localStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved >= min && saved <= max) setWidth(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const startDrag = useCallback(
    (e) => {
      e.preventDefault();
      const startX = e.touches ? e.touches[0].clientX : e.clientX;
      const startW = width;
      let latest = startW;

      const move = (ev) => {
        const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const delta = x - startX;
        const next = edge === "left" ? startW - delta : startW + delta;
        latest = Math.min(max, Math.max(min, next));
        setWidth(latest);
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("touchmove", move);
        window.removeEventListener("touchend", up);
        document.body.style.userSelect = "";
        if (storageKey && typeof window !== "undefined") {
          window.localStorage.setItem(storageKey, String(latest));
        }
      };
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("touchmove", move);
      window.addEventListener("touchend", up);
    },
    [width, min, max, edge, storageKey],
  );

  return { width, startDrag };
}
