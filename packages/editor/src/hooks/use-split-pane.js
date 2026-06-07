import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Horizontal split-pane sizing. Returns the left pane width as a percentage
 * plus a mousedown handler for the divider. Pass `storageKey` to persist the
 * percentage in localStorage (restored after mount, saved when a drag ends).
 */
export function useSplitPane(initialPct = 50, { min = 20, max = 80, storageKey } = {}) {
  const [leftPct, setLeftPct] = useState(initialPct);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const saved = Number(window.localStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved >= min && saved <= max) setLeftPct(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const onDividerMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      let latest = leftPct;

      const move = (ev) => {
        const rect = container.getBoundingClientRect();
        const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const pct = ((clientX - rect.left) / rect.width) * 100;
        latest = Math.min(max, Math.max(min, pct));
        setLeftPct(latest);
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
    [min, max, leftPct, storageKey],
  );

  return { leftPct, containerRef, onDividerMouseDown };
}
