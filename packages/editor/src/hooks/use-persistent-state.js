import { useEffect, useRef, useState } from "react";

/**
 * useState mirrored to localStorage under `key`. The saved value is restored
 * after mount (in an effect, not lazy init, so the first client render matches
 * the server and there's no hydration mismatch) and written on every change.
 * Pass `parse`/`serialize` for non-string values (e.g. booleans).
 */
export function usePersistentState(
  key,
  initial,
  { parse = (v) => v, serialize = (v) => String(v) } = {},
) {
  const [value, setValue] = useState(initial);
  const firstRun = useRef(true);

  useEffect(() => {
    if (!key || typeof window === "undefined") return;
    const raw = window.localStorage.getItem(key);
    if (raw != null) setValue(parse(raw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist on change, but skip the initial render so a default never clobbers
  // a saved value before the restore effect above applies it.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!key || typeof window === "undefined") return;
    window.localStorage.setItem(key, serialize(value));
  }, [key, value]);

  return [value, setValue];
}
