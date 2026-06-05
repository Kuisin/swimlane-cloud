import { useEffect, useRef } from "react";

/**
 * Registers global keydown shortcuts. Shortcuts is an array of:
 *   { key, mod?, shift?, enabled?, handler }
 * where `mod` means Cmd (Mac) or Ctrl (Win/Linux).
 * Uses a ref so handlers never go stale without re-registering the listener.
 */
export function useKeyboardShortcuts(shortcuts) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    function onKeyDown(e) {
      // When focus is inside a plain input field, only fire shortcuts that use
      // a modifier key (Cmd/Ctrl) or are Escape — plain character shortcuts
      // would conflict with typing.
      const tag = document.activeElement?.tagName;
      const isInputField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      for (const sc of ref.current) {
        if (sc.enabled === false) continue;
        const modMatch = sc.mod
          ? e.metaKey || e.ctrlKey
          : !e.metaKey && !e.ctrlKey;
        // `sc.shift` may be undefined (don't-care), true, or false
        const shiftMatch = sc.shift == null ? true : sc.shift ? e.shiftKey : !e.shiftKey;
        const keyMatch = e.key === sc.key || e.key.toLowerCase() === sc.key.toLowerCase();
        if (!modMatch || !shiftMatch || !keyMatch) continue;
        // Skip unmodified character shortcuts when typing in an input field
        if (isInputField && !sc.mod && sc.key !== "Escape") continue;
        e.preventDefault();
        sc.handler();
        return;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
