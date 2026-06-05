import { useCallback, useRef, useState } from "react";

/**
 * Horizontal split-pane sizing. Returns the left pane width as a percentage
 * plus a mousedown handler for the divider.
 */
export function useSplitPane(initialPct = 50, { min = 20, max = 80 } = {}) {
  const [leftPct, setLeftPct] = useState(initialPct);
  const containerRef = useRef(null);

  const onDividerMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const move = (ev) => {
        const rect = container.getBoundingClientRect();
        const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const pct = ((clientX - rect.left) / rect.width) * 100;
        setLeftPct(Math.min(max, Math.max(min, pct)));
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
    [min, max],
  );

  return { leftPct, containerRef, onDividerMouseDown };
}
