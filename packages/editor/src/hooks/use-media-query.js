import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches right now, kept in sync as the window
 * changes.
 *
 * `useSyncExternalStore` rather than `useState` + an effect because the server
 * has no window: the third argument is the server snapshot, so a Next.js host
 * (`apps/saas`) renders the wide layout on the server and corrects on hydration
 * instead of throwing. A `useState` version would either read `window` during
 * render — which breaks the build — or flash the wrong layout for a frame.
 *
 * The layout it drives must therefore be a progressive narrowing of the wide
 * one, never the other way round: a phone briefly sees the desktop layout, so
 * that has to be merely wrong rather than broken.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      // Safari only gained `addEventListener` on MediaQueryList in 14; the
      // deprecated `addListener` is the fallback, not the other way round.
      if (list.addEventListener) {
        list.addEventListener("change", onChange);
        return () => list.removeEventListener("change", onChange);
      }
      list.addListener(onChange);
      return () => list.removeListener(onChange);
    },
    [query],
  );

  const snapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/**
 * The width below which the editor shows one pane at a time.
 *
 * Set by what the panes actually need, not by a device: the step list and the
 * inspector together want about 620px, which leaves a phone or a tablet held
 * upright with no room at all for the drawn diagram — the thing the whole
 * product is for. Above this the three-column layout has somewhere to put it.
 */
export const NARROW_QUERY = "(max-width: 768px)";

/** The width below which the file tree starts out folded away. */
export const TREE_FOLD_QUERY = "(max-width: 1024px)";
