import { useCallback, useState } from "react";

/**
 * Pixel-width drag sizing for a side panel. Returns the current width plus a
 * pointer-down handler for a drag handle. `edge` says which side the handle sits
 * on: `"right"` (panel on the left, grows as you drag right) or `"left"` (panel
 * on the right, grows as you drag left).
 */
export function useDragWidth(initial, { min = 160, max = 600, edge = "right" } = {}) {
  const [width, setWidth] = useState(initial);

  const startDrag = useCallback(
    (e) => {
      e.preventDefault();
      const startX = e.touches ? e.touches[0].clientX : e.clientX;
      const startW = width;

      const move = (ev) => {
        const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const delta = x - startX;
        const next = edge === "left" ? startW - delta : startW + delta;
        setWidth(Math.min(max, Math.max(min, next)));
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("touchmove", move);
        window.removeEventListener("touchend", up);
        document.body.style.userSelect = "";
      };
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("touchmove", move);
      window.addEventListener("touchend", up);
    },
    [width, min, max, edge],
  );

  return { width, startDrag };
}
